"""
PDF Accessibility Tagger - Visual Content Analysis Engine

Analyzes PDFs the way a human would: by examining font sizes, positions,
boldness, spacing, and layout to determine what each block of text actually IS
before assigning structure tags.
"""

import pikepdf
from pathlib import Path
import logging
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
import math

from pdfminer.high_level import extract_pages
from pdfminer.layout import (
    LAParams, LTTextBox, LTTextLine, LTChar, LTAnon,
    LTFigure, LTImage, LTRect, LTLine, LTCurve, LTPage
)
from pdfminer.pdfpage import PDFPage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class TextBlock:
    """A block of text with its visual properties extracted from the PDF."""
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    page_num: int
    font_size: float        = 0.0
    is_bold: bool           = False
    is_italic: bool         = False
    is_all_caps: bool       = False
    is_centered: bool       = False
    char_count: int         = 0
    line_count: int         = 1
    avg_char_width: float   = 0.0

    # Assigned after full-page analysis
    tag: str                = 'P'
    heading_level: int      = 0      # 1-6 for headings, 0 for non-heading

    @property
    def width(self):
        return self.x1 - self.x0

    @property
    def height(self):
        return self.y1 - self.y0

    @property
    def midpoint_x(self):
        return (self.x0 + self.x1) / 2


@dataclass
class FigureBlock:
    """An image or figure region on the page."""
    x0: float
    y0: float
    x1: float
    y1: float
    page_num: int
    tag: str = 'Figure'


@dataclass
class TableBlock:
    """A detected table region."""
    x0: float
    y0: float
    x1: float
    y1: float
    page_num: int
    rows: List[List[str]] = field(default_factory=list)
    tag: str = 'Table'


@dataclass
class PageLayout:
    """Complete layout analysis for one page."""
    page_num: int
    width: float
    height: float
    text_blocks: List[TextBlock]
    figures: List[FigureBlock]
    tables: List[TableBlock]
    body_font_size: float   = 12.0   # modal font size = "normal" text
    page_margin_x: float   = 72.0   # estimated left/right margin
    column_count: int      = 1


# ---------------------------------------------------------------------------
# Helper: extract per-character font info from an LTTextLine
# ---------------------------------------------------------------------------

def _extract_line_font_info(ltline: LTTextLine) -> Tuple[float, bool, bool]:
    """
    Walk every LTChar in a line and return:
      (dominant_font_size, is_bold, is_italic)
    """
    sizes  = []
    bold   = False
    italic = False

    for char in ltline:
        if not isinstance(char, LTChar):
            continue
        sizes.append(char.size)
        fname = (char.fontname or '').lower()
        if any(w in fname for w in ('bold', 'black', 'heavy', 'demi', 'semibold')):
            bold = True
        if any(w in fname for w in ('italic', 'oblique', 'slant')):
            italic = True

    dominant = _median(sizes) if sizes else 0.0
    return dominant, bold, italic


def _median(values: list) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def _modal_size(sizes: list, precision: int = 1) -> float:
    """Return the most common font size, rounded to `precision` decimal places."""
    if not sizes:
        return 12.0
    rounded = [round(s, precision) for s in sizes]
    return Counter(rounded).most_common(1)[0][0]


# ---------------------------------------------------------------------------
# Page content extractor
# ---------------------------------------------------------------------------

BULLET_RE = re.compile(
    r'^(\s*)'
    r'([•◦▪▸►‣–\-\*]|\d+[.)]\s|\(?[a-zA-Z][.)]\s|[ivxlcdm]+[.)]\s)'
)

LIST_CONTINUATION_RE = re.compile(r'^\s{4,}')  # indented continuation line


def extract_page_blocks(
    lt_page: LTPage,
    page_num: int,
    page_width: float,
    page_height: float
) -> Tuple[List[TextBlock], List[FigureBlock]]:
    """
    Convert pdfminer layout objects into TextBlock / FigureBlock instances.
    Each LTTextBox becomes one TextBlock; the dominant font properties
    (size, bold, italic) are computed from the individual LTChar objects.
    """
    text_blocks: List[TextBlock] = []
    figures:     List[FigureBlock] = []

    for element in lt_page:

        # ---- Figures / images ------------------------------------------
        if isinstance(element, (LTFigure, LTImage)):
            figures.append(FigureBlock(
                x0=element.x0, y0=element.y0,
                x1=element.x1, y1=element.y1,
                page_num=page_num
            ))
            continue

        # ---- Text boxes ------------------------------------------------
        if not isinstance(element, LTTextBox):
            continue

        raw_text = element.get_text().strip()
        if not raw_text:
            continue

        # Collect per-line font properties
        line_sizes:  List[float] = []
        block_bold   = False
        block_italic = False
        line_count   = 0

        for line in element:
            if not isinstance(line, LTTextLine):
                continue
            line_count += 1
            sz, bold, italic = _extract_line_font_info(line)
            if sz > 0:
                line_sizes.append(sz)
            if bold:
                block_bold = True
            if italic:
                block_italic = True

        font_size = _median(line_sizes) if line_sizes else 0.0

        block = TextBlock(
            text       = raw_text,
            x0         = element.x0,
            y0         = element.y0,
            x1         = element.x1,
            y1         = element.y1,
            page_num   = page_num,
            font_size  = font_size,
            is_bold    = block_bold,
            is_italic  = block_italic,
            char_count = len(raw_text.replace('\n', '').replace(' ', '')),
            line_count = max(line_count, 1),
            is_all_caps= raw_text.replace('\n', '').replace(' ', '').isupper()
                         and len(raw_text) > 2,
        )
        text_blocks.append(block)

    return text_blocks, figures


# ---------------------------------------------------------------------------
# Column detector
# ---------------------------------------------------------------------------

def detect_columns(blocks: List[TextBlock], page_width: float) -> List[Tuple[float, float]]:
    """
    Returns list of (x_start, x_end) column bands by clustering block x0 values.
    Single-column pages return one band.
    """
    if not blocks:
        return [(0, page_width)]

    x_starts = sorted(b.x0 for b in blocks)

    # Simple gap detection: a column boundary exists where there is a
    # relative gap > 8 % of page width between consecutive x0 starts.
    threshold = page_width * 0.08
    bands = []
    band_start = x_starts[0]
    prev = x_starts[0]

    for x in x_starts[1:]:
        if x - prev > threshold:
            bands.append((band_start, prev))
            band_start = x
        prev = x
    bands.append((band_start, prev))

    return bands


# ---------------------------------------------------------------------------
# Table detector
# ---------------------------------------------------------------------------

GRID_TOLERANCE = 8.0   # pixels


def detect_tables(blocks: List[TextBlock]) -> List[TableBlock]:
    """
    Identify table regions by looking for sets of text blocks that share
    closely aligned x0 positions (columns) AND y-midpoints (rows).

    A minimum of 2 columns × 2 rows of aligned blocks is required.
    """
    if len(blocks) < 4:
        return []

    def round_coord(v, tol=GRID_TOLERANCE):
        return round(v / tol) * tol

    # Group blocks by rounded y-midpoint → rows
    row_groups: defaultdict = defaultdict(list)
    for b in blocks:
        y_mid = round_coord((b.y0 + b.y1) / 2)
        row_groups[y_mid].append(b)

    # Only rows with ≥2 blocks are candidate table rows
    candidate_rows = {y: bs for y, bs in row_groups.items() if len(bs) >= 2}
    if len(candidate_rows) < 2:
        return []

    # Find consistent column count across rows
    col_counts = Counter(len(bs) for bs in candidate_rows.values())
    dominant_cols = col_counts.most_common(1)[0][0]
    if dominant_cols < 2:
        return []

    table_rows = [
        sorted(bs, key=lambda b: b.x0)
        for y, bs in sorted(candidate_rows.items(), reverse=True)
        if len(bs) == dominant_cols
    ]

    if len(table_rows) < 2:
        return []

    # Build bounding box around the table
    all_blocks = [b for row in table_rows for b in row]
    x0 = min(b.x0 for b in all_blocks)
    y0 = min(b.y0 for b in all_blocks)
    x1 = max(b.x1 for b in all_blocks)
    y1 = max(b.y1 for b in all_blocks)

    rows_text = [[b.text.strip() for b in row] for row in table_rows]

    return [TableBlock(
        x0=x0, y0=y0, x1=x1, y1=y1,
        page_num=all_blocks[0].page_num,
        rows=rows_text
    )]


# ---------------------------------------------------------------------------
# Structure classifier
# ---------------------------------------------------------------------------

class StructureClassifier:
    """
    Given all TextBlocks on a page (with font sizes and positions),
    assigns a semantic tag to each block using heuristics that mirror
    how a human reader would interpret the visual layout.
    """

    # Tags that indicate list content
    LIST_ITEM_TAG = 'LI'
    # Minimum ratio of font size to body size to be a heading candidate
    HEADING_RATIO_THRESHOLDS = [
        (2.00, 1),   # ≥200 % of body → H1
        (1.60, 2),   # ≥160 %         → H2
        (1.30, 3),   # ≥130 %         → H3
        (1.15, 4),   # ≥115 %         → H4
        (1.05, 5),   # ≥105 %         → H5
        (0.95, 6),   # ≥ 95 % + bold  → H6
    ]

    def classify(self, layout: PageLayout) -> None:
        """
        Assign .tag (and .heading_level) to every TextBlock in *layout*,
        mutating the blocks in place.
        """
        blocks = layout.text_blocks
        if not blocks:
            return

        body_size  = layout.body_font_size
        page_w     = layout.width
        page_h     = layout.height
        margin_x   = layout.page_margin_x

        # Mark blocks that fall inside a detected table — tag them separately
        table_block_ids = set()
        for tbl in layout.tables:
            for b in blocks:
                if (b.x0 >= tbl.x0 - GRID_TOLERANCE and
                        b.x1 <= tbl.x1 + GRID_TOLERANCE and
                        b.y0 >= tbl.y0 - GRID_TOLERANCE and
                        b.y1 <= tbl.y1 + GRID_TOLERANCE):
                    table_block_ids.add(id(b))

        for b in blocks:
            if id(b) in table_block_ids:
                b.tag = 'TD'
                continue

            b.tag, b.heading_level = self._classify_block(
                b, body_size, page_w, page_h, margin_x
            )

    # ------------------------------------------------------------------
    def _classify_block(
        self,
        b: TextBlock,
        body_size: float,
        page_w: float,
        page_h: float,
        margin_x: float,
    ) -> Tuple[str, int]:

        text     = b.text.strip()
        fs       = b.font_size if b.font_size > 0 else body_size
        ratio    = fs / body_size if body_size > 0 else 1.0
        one_line = b.line_count == 1

        # ---- 1. Header / footer (very top or bottom of page, small text) ---
        top_margin    = page_h * 0.92
        bottom_margin = page_h * 0.08
        if (b.y0 > top_margin or b.y1 < bottom_margin) and fs <= body_size * 0.9:
            # Running headers/footers and page numbers
            if re.fullmatch(r'\d+', text):
                return ('Lbl', 0)          # page number
            return ('Artifact', 0)         # running header/footer

        # ---- 2. Captions (short, italic, near a figure) --------------------
        if b.is_italic and one_line and len(text) < 120:
            if re.match(r'^(fig(ure)?|table|chart|diagram|image|photo|exhibit)[\s\.\-–]?\s*\d',
                        text, re.IGNORECASE):
                return ('Caption', 0)

        # ---- 3. List items -------------------------------------------------
        if BULLET_RE.match(text):
            return ('LI', 0)

        # ---- 4. Code / pre-formatted (monospaced fonts) --------------------
        # We detect this from font name if available; fall back to indentation
        if LIST_CONTINUATION_RE.match(text) and '\n' in b.text and not b.is_bold:
            return ('Code', 0)

        # ---- 5. Block-quote (indented both sides significantly) ------------
        center   = page_w / 2
        indent_l = b.x0 - margin_x
        indent_r = (page_w - margin_x) - b.x1
        if indent_l > page_w * 0.10 and indent_r > page_w * 0.10 and not b.is_bold:
            return ('BlockQuote', 0)

        # ---- 6. Headings ---------------------------------------------------
        #   A block is a heading candidate if it is:
        #   • short (≤ 1 line  OR  ≤ 10 words), AND
        #   • large/bold relative to body text
        word_count = len(text.split())
        short      = one_line or word_count <= 10

        if short:
            # All-caps short text is treated as a heading regardless of size
            if b.is_all_caps and word_count <= 8:
                level = self._heading_level_by_ratio(ratio, b.is_bold)
                return (f'H{level}', level)

            # Size-based heading
            for threshold, level in self.HEADING_RATIO_THRESHOLDS:
                if ratio >= threshold:
                    # Level 6 requires bold to avoid false positives
                    if level == 6 and not (b.is_bold or b.is_all_caps):
                        break
                    return (f'H{level}', level)

            # Bold-only heading at body size (section labels, e.g. "Note:")
            if b.is_bold and one_line and word_count <= 6:
                return ('H6', 6)

        # ---- 7. Default: paragraph -----------------------------------------
        return ('P', 0)

    @staticmethod
    def _heading_level_by_ratio(ratio: float, is_bold: bool) -> int:
        if ratio >= 2.00:
            return 1
        if ratio >= 1.60:
            return 2
        if ratio >= 1.30:
            return 3
        if ratio >= 1.15:
            return 4
        if ratio >= 1.05:
            return 5
        return 6


# ---------------------------------------------------------------------------
# Reading-order sorter
# ---------------------------------------------------------------------------

def sort_reading_order(
    blocks: List[TextBlock],
    columns: List[Tuple[float, float]]
) -> List[TextBlock]:
    """
    Sort blocks into natural reading order:
      column-first (left → right), then top → bottom within each column.
    """
    def column_index(b: TextBlock) -> int:
        mid = b.midpoint_x
        for i, (cx0, cx1) in enumerate(columns):
            if cx0 - GRID_TOLERANCE <= mid <= cx1 + GRID_TOLERANCE:
                return i
        # Fallback: assign to closest column
        dists = [abs(mid - (cx0 + cx1) / 2) for cx0, cx1 in columns]
        return dists.index(min(dists))

    return sorted(blocks, key=lambda b: (column_index(b), -b.y1, b.x0))


# ---------------------------------------------------------------------------
# Full-page analyser
# ---------------------------------------------------------------------------

class PageAnalyser:
    """
    Orchestrates extraction + classification for a single page.
    """

    def __init__(self):
        self.classifier = StructureClassifier()

    def analyse(self, lt_page: LTPage, page_num: int) -> PageLayout:
        pw = lt_page.width
        ph = lt_page.height

        text_blocks, figures = extract_page_blocks(lt_page, page_num, pw, ph)

        # ---- Determine body (modal) font size ------------------------------
        all_sizes = [b.font_size for b in text_blocks if b.font_size > 0]
        body_size = _modal_size(all_sizes) if all_sizes else 12.0

        # ---- Estimate page margin ------------------------------------------
        if text_blocks:
            margin_x = min(b.x0 for b in text_blocks)
        else:
            margin_x = pw * 0.10

        # ---- Detect tables -------------------------------------------------
        tables = detect_tables(text_blocks)

        # ---- Detect columns ------------------------------------------------
        non_table_blocks = [b for b in text_blocks
                            if not any(
                                b.x0 >= t.x0 - GRID_TOLERANCE and
                                b.x1 <= t.x1 + GRID_TOLERANCE
                                for t in tables
                            )]
        columns = detect_columns(non_table_blocks, pw)

        layout = PageLayout(
            page_num     = page_num,
            width        = pw,
            height       = ph,
            text_blocks  = text_blocks,
            figures      = figures,
            tables       = tables,
            body_font_size = body_size,
            page_margin_x  = margin_x,
            column_count   = len(columns),
        )

        # ---- Classify every block ------------------------------------------
        self.classifier.classify(layout)

        # ---- Sort into reading order ---------------------------------------
        layout.text_blocks = sort_reading_order(layout.text_blocks, columns)

        return layout


# ---------------------------------------------------------------------------
# Structure-tree builder (pikepdf)
# ---------------------------------------------------------------------------

ROLE_MAP_ROLES = [
    'Document', 'Part', 'Art', 'Sect', 'Div', 'BlockQuote', 'Caption',
    'TOC', 'TOCI', 'Index', 'NonStruct', 'Private',
    'H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'P', 'L', 'LI', 'Lbl', 'LBody',
    'Table', 'TR', 'TH', 'TD',
    'Span', 'Quote', 'Note', 'Reference', 'BibEntry',
    'Code', 'Link', 'Annot', 'Figure', 'Formula', 'Form',
    'Artifact',
]


def _make_role_map(pdf: pikepdf.Pdf) -> pikepdf.Dictionary:
    rm = pikepdf.Dictionary()
    for role in ROLE_MAP_ROLES:
        rm[pikepdf.Name(f'/{role}')] = pikepdf.Name(f'/{role}')
    return rm


def build_structure_tree(pdf: pikepdf.Pdf, page_layouts: List[PageLayout]) -> None:
    """
    Construct a complete PDF structure tree from the analysed page layouts.

    Strategy
    --------
    * One /Document element at the root.
    * One /Sect per page.
    * Inside each Sect: heading + paragraph sequences are wrapped in /Div
      elements; lists are wrapped in /L; tables in /Table.
    """

    struct_root = pikepdf.Dictionary(
        Type       = pikepdf.Name('/StructTreeRoot'),
        K          = pikepdf.Array(),
        ParentTree = pdf.make_indirect(
            pikepdf.Dictionary(Nums=pikepdf.Array())
        ),
        RoleMap    = _make_role_map(pdf),
    )
    struct_root_ref = pdf.make_indirect(struct_root)
    pdf.Root.StructTreeRoot = struct_root_ref

    doc_elem = pdf.make_indirect(pikepdf.Dictionary(
        Type = pikepdf.Name('/StructElem'),
        S    = pikepdf.Name('/Document'),
        P    = struct_root_ref,
        K    = pikepdf.Array(),
    ))
    struct_root.K.append(doc_elem)

    for layout in page_layouts:
        _add_page_to_tree(pdf, doc_elem, struct_root_ref, layout)


def _add_page_to_tree(
    pdf: pikepdf.Pdf,
    doc_elem: pikepdf.Dictionary,
    struct_root_ref,
    layout: PageLayout,
) -> None:
    """Add all structure elements for one page under doc_elem."""

    # pdf.pages[n] returns a pikepdf.Page which is always an indirect object;
    # use it directly — calling make_indirect() on it would create a broken ref.
    page_obj = pdf.pages[layout.page_num]
    page_ref = page_obj

    # Mark page with its structure-parent index so PDF readers can
    # navigate from a page back into the structure tree.
    page_obj.StructParents = layout.page_num

    sect_elem = pdf.make_indirect(pikepdf.Dictionary(
        Type = pikepdf.Name('/StructElem'),
        S    = pikepdf.Name('/Sect'),
        P    = doc_elem,
        Pg   = page_ref,
        K    = pikepdf.Array(),
    ))
    doc_elem.K.append(sect_elem)

    # ------------------------------------------------------------------
    # Add figures
    # ------------------------------------------------------------------
    for fig in layout.figures:
        fig_elem = pdf.make_indirect(pikepdf.Dictionary(
            Type = pikepdf.Name('/StructElem'),
            S    = pikepdf.Name('/Figure'),
            P    = sect_elem,
            Pg   = page_ref,
            Alt  = 'Image',          # placeholder alt text
        ))
        sect_elem.K.append(fig_elem)

    # ------------------------------------------------------------------
    # Add tables
    # ------------------------------------------------------------------
    for tbl in layout.tables:
        tbl_elem = pdf.make_indirect(pikepdf.Dictionary(
            Type = pikepdf.Name('/StructElem'),
            S    = pikepdf.Name('/Table'),
            P    = sect_elem,
            Pg   = page_ref,
            K    = pikepdf.Array(),
        ))
        sect_elem.K.append(tbl_elem)

        for row in tbl.rows:
            tr_elem = pdf.make_indirect(pikepdf.Dictionary(
                Type = pikepdf.Name('/StructElem'),
                S    = pikepdf.Name('/TR'),
                P    = tbl_elem,
                Pg   = page_ref,
                K    = pikepdf.Array(),
            ))
            tbl_elem.K.append(tr_elem)

            for i, cell_text in enumerate(row):
                cell_tag = '/TH' if tbl.rows.index(row) == 0 else '/TD'
                td_elem = pdf.make_indirect(pikepdf.Dictionary(
                    Type = pikepdf.Name('/StructElem'),
                    S    = pikepdf.Name(cell_tag),
                    P    = tr_elem,
                    Pg   = page_ref,
                    Alt  = cell_text[:255],
                ))
                tr_elem.K.append(td_elem)

    # ------------------------------------------------------------------
    # Add text content, grouping consecutive list items into /L wrappers
    # ------------------------------------------------------------------
    list_elem    = None   # current open <L> wrapper
    current_div  = None   # current section grouping

    # Blocks already in tables are tagged TD — skip re-processing them
    table_texts = set()
    for tbl in layout.tables:
        for row in tbl.rows:
            for cell in row:
                table_texts.add(cell.strip())

    for b in layout.text_blocks:
        if b.tag == 'Artifact':
            continue   # skip headers/footers
        if b.text.strip() in table_texts:
            continue   # already in the table element

        is_list_item = b.tag in ('LI', 'Lbl', 'LBody')

        # Close any open list if this block is not a list item
        if not is_list_item and list_elem is not None:
            list_elem = None

        # Open a new list wrapper
        if is_list_item and list_elem is None:
            list_elem = pdf.make_indirect(pikepdf.Dictionary(
                Type = pikepdf.Name('/StructElem'),
                S    = pikepdf.Name('/L'),
                P    = sect_elem,
                Pg   = page_ref,
                K    = pikepdf.Array(),
            ))
            sect_elem.K.append(list_elem)

        parent = list_elem if is_list_item else sect_elem

        # Determine PDF structure type
        s_type = pikepdf.Name(f'/{b.tag}')

        kwargs = dict(
            Type = pikepdf.Name('/StructElem'),
            S    = s_type,
            P    = parent,
            Pg   = page_ref,
            Alt  = b.text.strip()[:255],
        )

        elem = pdf.make_indirect(pikepdf.Dictionary(**kwargs))
        parent.K.append(elem)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class PDFAccessibilityTagger:
    """
    Main entry point. Accepts a PDF, analyses its content visually,
    and writes a fully tagged accessible output PDF.
    """

    def __init__(self):
        self.processed_count = 0
        self.page_analyser   = PageAnalyser()

    # ------------------------------------------------------------------
    def tag_pdf(self, input_path: Path, output_path: Path) -> bool:
        try:
            logger.info(f"Analysing layout: {input_path.name}")

            # ---- 1. Extract layout with pdfminer -------------------------
            laparams = LAParams(
                line_overlap        = 0.5,
                char_margin         = 2.0,
                line_margin         = 0.5,
                word_margin         = 0.1,
                boxes_flow          = 0.5,   # mix horizontal + vertical flow
                detect_vertical     = False,
            )

            page_layouts: List[PageLayout] = []
            with open(input_path, 'rb') as fh:
                for page_num, lt_page in enumerate(extract_pages(fh, laparams=laparams)):
                    layout = self.page_analyser.analyse(lt_page, page_num)
                    page_layouts.append(layout)

            # ---- 2. Open with pikepdf and build structure tree -----------
            with pikepdf.open(input_path) as pdf:

                # Metadata
                with pdf.open_metadata() as meta:
                    meta['dc:title']    = input_path.stem.replace('_', ' ').replace('-', ' ')
                    meta['dc:language'] = 'en-US'
                    meta['dc:format']   = 'application/pdf'
                    meta['pdf:Producer']= 'PDF Accessibility Tagger v2'

                # Mark document as tagged
                pdf.Root.MarkInfo = pdf.make_indirect(
                    pikepdf.Dictionary(Marked=True)
                )

                # Language
                pdf.Root.Lang = 'en-US'

                # Viewer preferences
                pdf.Root.ViewerPreferences = pikepdf.Dictionary(
                    DisplayDocTitle = True,
                    FitWindow       = False,
                )

                # Build the structure tree from our analysis
                build_structure_tree(pdf, page_layouts)

                pdf.save(output_path)

            logger.info(
                f"Tagged {sum(len(l.text_blocks) for l in page_layouts)} blocks "
                f"across {len(page_layouts)} pages → {output_path.name}"
            )
            self.processed_count += 1
            return True

        except Exception as e:
            logger.exception(f"Error processing {input_path.name}: {e}")
            return False

    # ------------------------------------------------------------------
    def tag_batch(self, input_files: list, output_folder: Path) -> dict:
        results = {
            'total':      len(input_files),
            'successful': 0,
            'failed':     0,
            'files':      [],
        }

        for input_file in input_files:
            input_path  = Path(input_file)
            output_path = output_folder / f"tagged_{input_path.name}"

            success = self.tag_pdf(input_path, output_path)

            results['files'].append({
                'input':   input_path.name,
                'output':  output_path.name if success else None,
                'success': success,
            })

            if success:
                results['successful'] += 1
            else:
                results['failed'] += 1

        return results


# ---------------------------------------------------------------------------
# Validation helper (unchanged)
# ---------------------------------------------------------------------------

def validate_pdf(file_path: Path) -> bool:
    try:
        with pikepdf.open(file_path) as pdf:
            _ = len(pdf.pages)
        return True
    except Exception as e:
        logger.error(f"Invalid PDF {file_path.name}: {e}")
        return False

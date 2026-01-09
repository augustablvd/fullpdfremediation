"""
PDF Accessibility Tagger
Adds proper structure tags to PDFs for accessibility compliance
"""

import pikepdf
from pathlib import Path
from PyPDF2 import PdfReader, PdfWriter
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PDFAccessibilityTagger:
    """
    Creates accessible PDFs with proper structure tags for screen readers
    """

    def __init__(self):
        self.processed_count = 0

    def tag_pdf(self, input_path: Path, output_path: Path) -> bool:
        """
        Add accessibility tags to a PDF

        Args:
            input_path: Path to input PDF file
            output_path: Path to output tagged PDF file

        Returns:
            bool: True if successful, False otherwise
        """
        try:
            logger.info(f"Processing PDF: {input_path.name}")

            # Open the PDF with pikepdf for better structure manipulation
            with pikepdf.open(input_path) as pdf:

                # Add document metadata for accessibility
                with pdf.open_metadata() as meta:
                    meta['dc:title'] = input_path.stem
                    meta['dc:format'] = 'application/pdf'
                    meta['pdf:Producer'] = 'PDF Accessibility Tagger'

                # Mark the document as tagged
                if '/MarkInfo' not in pdf.Root:
                    pdf.Root.MarkInfo = pdf.make_indirect(pikepdf.Dictionary())

                pdf.Root.MarkInfo.Marked = True

                # Set language for accessibility
                if '/Lang' not in pdf.Root:
                    pdf.Root.Lang = 'en-US'

                # Add ViewerPreferences for better accessibility
                if '/ViewerPreferences' not in pdf.Root:
                    pdf.Root.ViewerPreferences = pikepdf.Dictionary()

                pdf.Root.ViewerPreferences.DisplayDocTitle = True

                # Create structure tree root if it doesn't exist
                if '/StructTreeRoot' not in pdf.Root:
                    struct_tree_root = pikepdf.Dictionary(
                        Type=pikepdf.Name('/StructTreeRoot'),
                        K=pikepdf.Array(),
                        ParentTree=pikepdf.Dictionary(
                            Nums=pikepdf.Array()
                        )
                    )
                    pdf.Root.StructTreeRoot = pdf.make_indirect(struct_tree_root)

                    # Add role map for standard structure types
                    role_map = pikepdf.Dictionary()
                    standard_roles = ['Document', 'Part', 'Art', 'Sect', 'Div',
                                     'BlockQuote', 'Caption', 'TOC', 'TOCI', 'Index',
                                     'NonStruct', 'Private', 'H', 'H1', 'H2', 'H3',
                                     'H4', 'H5', 'H6', 'P', 'L', 'LI', 'Lbl', 'LBody',
                                     'Table', 'TR', 'TH', 'TD', 'Span', 'Quote', 'Note',
                                     'Reference', 'BibEntry', 'Code', 'Link', 'Annot',
                                     'Figure', 'Formula', 'Form']

                    for role in standard_roles:
                        role_map[pikepdf.Name(f'/{role}')] = pikepdf.Name(f'/{role}')

                    pdf.Root.StructTreeRoot.RoleMap = role_map

                    # Create a basic document structure
                    document_struct = pikepdf.Dictionary(
                        Type=pikepdf.Name('/StructElem'),
                        S=pikepdf.Name('/Document'),
                        P=pdf.Root.StructTreeRoot,
                        K=pikepdf.Array()
                    )

                    # Add structure elements for each page
                    for page_num, page in enumerate(pdf.pages):
                        page_struct = pikepdf.Dictionary(
                            Type=pikepdf.Name('/StructElem'),
                            S=pikepdf.Name('/Part'),
                            P=document_struct,
                            Pg=page,
                            K=pikepdf.Array()
                        )
                        document_struct.K.append(pdf.make_indirect(page_struct))

                        # Mark the page object with structure parent
                        if '/StructParents' not in page:
                            page.StructParents = page_num

                    pdf.Root.StructTreeRoot.K.append(pdf.make_indirect(document_struct))

                # Save the tagged PDF
                pdf.save(output_path)

            logger.info(f"Successfully tagged PDF: {output_path.name}")
            self.processed_count += 1
            return True

        except Exception as e:
            logger.error(f"Error processing {input_path.name}: {str(e)}")
            return False

    def tag_batch(self, input_files: list, output_folder: Path) -> dict:
        """
        Process multiple PDFs

        Args:
            input_files: List of input PDF file paths
            output_folder: Directory for output files

        Returns:
            dict: Summary of processing results
        """
        results = {
            'total': len(input_files),
            'successful': 0,
            'failed': 0,
            'files': []
        }

        for input_file in input_files:
            input_path = Path(input_file)
            output_path = output_folder / f"tagged_{input_path.name}"

            success = self.tag_pdf(input_path, output_path)

            file_result = {
                'input': input_path.name,
                'output': output_path.name if success else None,
                'success': success
            }

            results['files'].append(file_result)

            if success:
                results['successful'] += 1
            else:
                results['failed'] += 1

        return results


def validate_pdf(file_path: Path) -> bool:
    """
    Validate that a file is a readable PDF

    Args:
        file_path: Path to PDF file

    Returns:
        bool: True if valid PDF, False otherwise
    """
    try:
        with pikepdf.open(file_path) as pdf:
            # Try to access basic PDF properties
            _ = len(pdf.pages)
        return True
    except Exception as e:
        logger.error(f"Invalid PDF {file_path.name}: {str(e)}")
        return False

# PDF Accessibility Tagger

A web application that automatically creates fully accessible, tagged PDFs from uploaded documents. This tool adds proper structure tags to PDFs, making them accessible to screen readers and compliant with accessibility standards.

## Features

- **Single & Batch Upload**: Upload one PDF or multiple PDFs at once (up to 50 files)
- **Automatic Tagging**: Adds proper structure tags for accessibility compliance
- **Document Metadata**: Sets title, language, and producer information
- **Structure Tree**: Creates hierarchical document structure for screen readers
- **ViewerPreferences**: Configures PDF for optimal accessibility display
- **Batch Download**: Download all processed files as a ZIP archive
- **User-Friendly Interface**: Drag-and-drop support with real-time progress tracking

## Accessibility Features Added

The application automatically adds the following accessibility features to PDFs:

- ✓ Document structure tags (StructTreeRoot)
- ✓ Marked content for screen readers
- ✓ Document language specification
- ✓ Proper role mapping for standard structure types
- ✓ Document metadata (title, format, producer)
- ✓ Viewer preferences for accessibility
- ✓ Page structure elements
- ✓ Logical reading order

## Requirements

- Python 3.8 or higher
- pip (Python package manager)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd fullpdfremediation
```

### 2. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

## Usage

### Starting the Application

1. Activate the virtual environment:
   ```bash
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Run the Flask application:
   ```bash
   python app.py
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:5000
   ```

### Using the Web Interface

1. **Upload PDFs**:
   - Click "Browse Files" or drag and drop PDF files onto the upload area
   - You can upload single files or batch upload (max 50 files)

2. **Process**:
   - Click "Process PDFs" to start the accessibility tagging
   - Watch the progress bar as files are processed

3. **Download**:
   - Download individual files using the "Download" button next to each file
   - Or download all processed files as a ZIP using "Download All as ZIP"

4. **Start New Batch**:
   - Click "Process New Files" to upload and process more PDFs

## API Endpoints

The application provides a REST API for programmatic access:

### Upload Files
```http
POST /api/upload
Content-Type: multipart/form-data

Form Data:
  files: [PDF files]

Response:
{
  "session_id": "abc123",
  "total": 5,
  "successful": 5,
  "failed": 0,
  "files": [
    {
      "input": "document.pdf",
      "output": "tagged_abc123_20240101_120000_document.pdf",
      "success": true
    }
  ]
}
```

### Download Single File
```http
GET /api/download/<filename>

Response: PDF file download
```

### Download Batch as ZIP
```http
POST /api/download-batch
Content-Type: application/json

Body:
{
  "files": ["file1.pdf", "file2.pdf"]
}

Response: ZIP file download
```

### Cleanup Session Files
```http
DELETE /api/cleanup/<session_id>

Response:
{
  "message": "Cleaned up 5 files",
  "deleted": 5
}
```

### Health Check
```http
GET /api/health

Response:
{
  "status": "healthy",
  "service": "PDF Accessibility Tagger",
  "version": "1.0.0"
}
```

## Configuration

Edit `config.py` to customize settings:

- `MAX_CONTENT_LENGTH`: Maximum file size (default: 100MB)
- `BATCH_SIZE_LIMIT`: Maximum files per batch (default: 50)
- `UPLOAD_FOLDER`: Directory for uploaded files
- `PROCESSED_FOLDER`: Directory for processed files

## Project Structure

```
fullpdfremediation/
├── app.py                  # Flask application and API endpoints
├── pdf_tagger.py           # PDF accessibility tagging engine
├── config.py               # Application configuration
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html          # Web interface
├── static/
│   ├── css/
│   │   └── style.css       # Styling
│   └── js/
│       └── main.js         # Frontend JavaScript
├── uploads/                # Temporary uploaded files
└── processed/              # Tagged PDF output files
```

## Technical Details

### PDF Processing

The application uses `pikepdf` for robust PDF manipulation:

- **Structure Tree**: Creates a proper document structure hierarchy
- **Role Mapping**: Maps standard PDF structure types (H1-H6, P, Table, etc.)
- **Metadata**: Sets document properties for accessibility
- **Page Tagging**: Associates structure elements with pages

### Security

- File upload validation (PDF files only)
- Secure filename handling
- Maximum file size limits
- Batch size restrictions
- Session-based file isolation

## Troubleshooting

### Common Issues

**Import Error: No module named 'pikepdf'**
```bash
pip install -r requirements.txt
```

**Port 5000 already in use**
- Edit `app.py` and change the port number in the last line
- Or kill the process using port 5000

**Files not processing**
- Ensure PDFs are valid and not corrupted
- Check file size is under 100MB limit
- Verify Python version is 3.8+

## Development

### Running in Debug Mode

The application runs in debug mode by default when started with `python app.py`. For production:

```python
# In app.py, change the last line to:
app.run(debug=False, host='0.0.0.0', port=5000)
```

### Adding New Features

- PDF processing logic: Edit `pdf_tagger.py`
- API endpoints: Edit `app.py`
- Frontend: Edit files in `templates/` and `static/`

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## Support

For issues and questions, please open an issue on the GitHub repository.

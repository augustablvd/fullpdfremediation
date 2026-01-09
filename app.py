"""
PDF Accessibility Tagger Web Application
Flask-based web service for uploading and processing PDFs for accessibility
"""

from flask import Flask, request, jsonify, render_template, send_file, send_from_directory
from werkzeug.utils import secure_filename
from pathlib import Path
import os
import uuid
from datetime import datetime
import logging

from config import Config
from pdf_tagger import PDFAccessibilityTagger, validate_pdf

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)
Config.init_app(app)

# Initialize PDF tagger
tagger = PDFAccessibilityTagger()


def allowed_file(filename):
    """Check if file has allowed extension"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']


@app.route('/')
def index():
    """Render main upload page"""
    return render_template('index.html')


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """
    Handle single or batch PDF upload
    Accepts: multipart/form-data with 'files' field
    Returns: JSON with processing results
    """
    try:
        # Check if files were uploaded
        if 'files' not in request.files:
            return jsonify({'error': 'No files uploaded'}), 400

        files = request.files.getlist('files')

        if not files or files[0].filename == '':
            return jsonify({'error': 'No files selected'}), 400

        # Check batch size limit
        if len(files) > app.config['BATCH_SIZE_LIMIT']:
            return jsonify({
                'error': f'Batch size exceeds limit of {app.config["BATCH_SIZE_LIMIT"]} files'
            }), 400

        # Generate unique session ID for this batch
        session_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        uploaded_files = []
        invalid_files = []

        # Process each uploaded file
        for file in files:
            if file and allowed_file(file.filename):
                # Secure the filename and add session ID
                original_filename = secure_filename(file.filename)
                filename = f"{session_id}_{timestamp}_{original_filename}"

                # Save uploaded file
                upload_path = app.config['UPLOAD_FOLDER'] / filename
                file.save(upload_path)

                # Validate PDF
                if validate_pdf(upload_path):
                    uploaded_files.append(upload_path)
                else:
                    invalid_files.append(original_filename)
                    upload_path.unlink()  # Delete invalid file
            else:
                invalid_files.append(file.filename)

        if not uploaded_files:
            return jsonify({
                'error': 'No valid PDF files uploaded',
                'invalid_files': invalid_files
            }), 400

        # Process PDFs
        results = tagger.tag_batch(uploaded_files, app.config['PROCESSED_FOLDER'])

        # Clean up uploaded files
        for file_path in uploaded_files:
            try:
                file_path.unlink()
            except Exception as e:
                logger.warning(f"Could not delete uploaded file {file_path}: {e}")

        # Add session info and invalid files to results
        results['session_id'] = session_id
        results['invalid_files'] = invalid_files

        logger.info(f"Processed {results['successful']}/{results['total']} files for session {session_id}")

        return jsonify(results), 200

    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500


@app.route('/api/download/<filename>', methods=['GET'])
def download_file(filename):
    """
    Download a processed PDF file
    Args:
        filename: Name of the processed file
    """
    try:
        # Secure the filename
        filename = secure_filename(filename)
        file_path = app.config['PROCESSED_FOLDER'] / filename

        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 404

        # Send file and optionally delete after sending
        response = send_file(
            file_path,
            as_attachment=True,
            download_name=filename.replace('tagged_', ''),
            mimetype='application/pdf'
        )

        return response

    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        return jsonify({'error': f'Download error: {str(e)}'}), 500


@app.route('/api/download-batch', methods=['POST'])
def download_batch():
    """
    Download multiple files as a ZIP archive
    Expects JSON: {"files": ["file1.pdf", "file2.pdf", ...]}
    """
    try:
        import zipfile
        import io

        data = request.get_json()
        if not data or 'files' not in data:
            return jsonify({'error': 'No files specified'}), 400

        filenames = data['files']

        # Create in-memory ZIP file
        memory_file = io.BytesIO()

        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for filename in filenames:
                filename = secure_filename(filename)
                file_path = app.config['PROCESSED_FOLDER'] / filename

                if file_path.exists():
                    # Add file to ZIP with cleaned name
                    zipf.write(
                        file_path,
                        arcname=filename.replace('tagged_', '')
                    )

        memory_file.seek(0)

        return send_file(
            memory_file,
            as_attachment=True,
            download_name='accessible_pdfs.zip',
            mimetype='application/zip'
        )

    except Exception as e:
        logger.error(f"Batch download error: {str(e)}")
        return jsonify({'error': f'Batch download error: {str(e)}'}), 500


@app.route('/api/cleanup/<session_id>', methods=['DELETE'])
def cleanup_session(session_id):
    """
    Clean up processed files for a session
    Args:
        session_id: Session ID to clean up
    """
    try:
        deleted_count = 0

        # Find and delete all files with this session ID
        for file_path in app.config['PROCESSED_FOLDER'].glob(f"tagged_{session_id}_*"):
            file_path.unlink()
            deleted_count += 1

        return jsonify({
            'message': f'Cleaned up {deleted_count} files',
            'deleted': deleted_count
        }), 200

    except Exception as e:
        logger.error(f"Cleanup error: {str(e)}")
        return jsonify({'error': f'Cleanup error: {str(e)}'}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'PDF Accessibility Tagger',
        'version': '1.0.0'
    }), 200


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

import os
from pathlib import Path

class Config:
    """Application configuration"""

    # Base directory
    BASE_DIR = Path(__file__).parent

    # Upload settings
    UPLOAD_FOLDER = BASE_DIR / 'uploads'
    PROCESSED_FOLDER = BASE_DIR / 'processed'
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max file size
    ALLOWED_EXTENSIONS = {'pdf'}

    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    # Processing settings
    BATCH_SIZE_LIMIT = 50  # Maximum number of PDFs in a batch

    @staticmethod
    def init_app(app):
        """Initialize application directories"""
        Config.UPLOAD_FOLDER.mkdir(exist_ok=True)
        Config.PROCESSED_FOLDER.mkdir(exist_ok=True)

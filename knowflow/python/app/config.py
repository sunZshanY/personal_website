"""KnowFlow Configuration"""
import os


class Config:
    HOST = os.environ.get('KNOWFLOW_HOST', '127.0.0.1')
    PORT = int(os.environ.get('KNOWFLOW_PORT', 5001))
    DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
    NOTES_FILE = os.path.join(DATA_DIR, 'notes.json')
    CATEGORIES_FILE = os.path.join(DATA_DIR, 'categories.json')

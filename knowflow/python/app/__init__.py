"""KnowFlow Flask Application Factory"""
from flask import Flask
from flask_cors import CORS

from .config import Config
from .routes.notes import notes_bp


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    CORS(app)

    app.register_blueprint(notes_bp, url_prefix='/api')

    return app

"""KnowFlow REST API — Notes & Categories"""
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, current_app

from ..models import NoteStore, CategoryStore

notes_bp = Blueprint('notes', __name__)


def _get_stores():
    """Lazy init stores from app config."""
    app = current_app
    if not hasattr(app, '_note_store'):
        app._note_store = NoteStore(app.config['NOTES_FILE'])
    if not hasattr(app, '_category_store'):
        app._category_store = CategoryStore(app.config['CATEGORIES_FILE'])
    return app._note_store, app._category_store


# ─── Health ───────────────────────────────────────────
@notes_bp.route('/health', methods=['GET'])
def health():
    note_store, _ = _get_stores()
    return jsonify({
        'status': 'ok',
        'service': 'KnowFlow API',
        'note_count': len(note_store.all()),
    })


# ─── Notes CRUD ───────────────────────────────────────
@notes_bp.route('/notes', methods=['GET'])
def list_notes():
    note_store, _ = _get_stores()
    search = request.args.get('search', '').strip()
    category = request.args.get('category', '').strip()
    tag = request.args.get('tag', '').strip()
    favorite = request.args.get('favorite', '').strip()

    notes = note_store.all()

    if search:
        q = search.lower()
        notes = [n for n in notes
                 if q in n.get('title', '').lower()
                 or q in n.get('content', '').lower()
                 or any(q in t.lower() for t in n.get('tags', []))]
    if category:
        notes = [n for n in notes if n.get('category') == category]
    if tag:
        notes = [n for n in notes if tag in n.get('tags', [])]
    if favorite == 'true':
        notes = [n for n in notes if n.get('favorite')]

    # Sort by updatedAt desc
    notes.sort(key=lambda n: n.get('updatedAt', ''), reverse=True)

    return jsonify({'notes': notes, 'count': len(notes)})


@notes_bp.route('/notes/<note_id>', methods=['GET'])
def get_note(note_id):
    note_store, _ = _get_stores()
    note = note_store.get(note_id)
    if note is None:
        return jsonify({'error': 'Note not found'}), 404
    return jsonify({'note': note})


@notes_bp.route('/notes', methods=['POST'])
def create_note():
    note_store, _ = _get_stores()
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid JSON'}), 400

    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    now = datetime.now(timezone.utc).isoformat()
    note = {
        'id': str(uuid.uuid4()),
        'title': title,
        'category': (data.get('category') or '').strip(),
        'content': data.get('content') or '',
        'tags': data.get('tags') or [],
        'createdAt': now,
        'updatedAt': now,
        'favorite': bool(data.get('favorite', False)),
    }
    note_store.create(note)
    return jsonify({'note': note}), 201


@notes_bp.route('/notes/<note_id>', methods=['PUT'])
def update_note(note_id):
    note_store, _ = _get_stores()
    existing = note_store.get(note_id)
    if existing is None:
        return jsonify({'error': 'Note not found'}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid JSON'}), 400

    updatable = {'title', 'category', 'content', 'tags', 'favorite'}
    patch = {k: v for k, v in data.items() if k in updatable}

    if 'title' in patch and not patch['title'].strip():
        return jsonify({'error': 'Title cannot be empty'}), 400

    note_store.update(note_id, patch)
    return jsonify({'note': note_store.get(note_id)})


@notes_bp.route('/notes/<note_id>', methods=['DELETE'])
def delete_note(note_id):
    note_store, _ = _get_stores()
    deleted = note_store.delete(note_id)
    if not deleted:
        return jsonify({'error': 'Note not found'}), 404
    return jsonify({'message': 'Note deleted'})


# ─── Categories ───────────────────────────────────────
@notes_bp.route('/categories', methods=['GET'])
def list_categories():
    _, cat_store = _get_stores()
    return jsonify({'categories': cat_store.all()})


@notes_bp.route('/categories', methods=['POST'])
def create_category():
    _, cat_store = _get_stores()
    data = request.get_json(silent=True)
    if not data or not (data.get('name') or '').strip():
        return jsonify({'error': 'Category name is required'}), 400
    name = data['name'].strip()
    cats = cat_store.add(name)
    return jsonify({'categories': cats}), 201


@notes_bp.route('/categories/<name>', methods=['DELETE'])
def delete_category(name):
    _, cat_store = _get_stores()
    cats = cat_store.remove(name)
    return jsonify({'categories': cats})

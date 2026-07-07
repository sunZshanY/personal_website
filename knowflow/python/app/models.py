"""KnowFlow Data Models & JSON Storage"""
import json
import os
import threading
from datetime import datetime, timezone


class NoteStore:
    """Thread-safe JSON file storage for notes."""

    def __init__(self, filepath):
        self._filepath = filepath
        self._lock = threading.Lock()
        self._ensure_file()

    def _ensure_file(self):
        os.makedirs(os.path.dirname(self._filepath), exist_ok=True)
        if not os.path.exists(self._filepath):
            self._write([])

    def _read(self):
        try:
            with open(self._filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _write(self, data):
        with open(self._filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def all(self):
        with self._lock:
            return self._read()

    def get(self, note_id):
        with self._lock:
            notes = self._read()
            for n in notes:
                if n['id'] == note_id:
                    return n
            return None

    def create(self, note):
        with self._lock:
            notes = self._read()
            notes.insert(0, note)
            self._write(notes)
            return note

    def update(self, note_id, data):
        with self._lock:
            notes = self._read()
            for n in notes:
                if n['id'] == note_id:
                    n.update(data)
                    n['updatedAt'] = datetime.now(timezone.utc).isoformat()
                    self._write(notes)
                    return n
            return None

    def delete(self, note_id):
        with self._lock:
            notes = self._read()
            filtered = [n for n in notes if n['id'] != note_id]
            if len(filtered) == len(notes):
                return False
            self._write(filtered)
            return True

    def search(self, query):
        q = query.lower()
        with self._lock:
            return [n for n in self._read()
                    if q in n.get('title', '').lower()
                    or q in n.get('content', '').lower()
                    or any(q in t.lower() for t in n.get('tags', []))
                    or q in n.get('category', '').lower()]


class CategoryStore:
    """JSON file storage for categories."""

    def __init__(self, filepath):
        self._filepath = filepath
        self._lock = threading.Lock()
        self._ensure_file()

    def _ensure_file(self):
        os.makedirs(os.path.dirname(self._filepath), exist_ok=True)
        if not os.path.exists(self._filepath):
            self._write([])

    def _read(self):
        try:
            with open(self._filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _write(self, data):
        with open(self._filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def all(self):
        with self._lock:
            return self._read()

    def add(self, name):
        with self._lock:
            cats = self._read()
            if name not in cats:
                cats.append(name)
                self._write(cats)
            return cats

    def remove(self, name):
        with self._lock:
            cats = self._read()
            if name in cats:
                cats.remove(name)
                self._write(cats)
            return cats

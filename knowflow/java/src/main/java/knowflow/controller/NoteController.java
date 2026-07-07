package knowflow.controller;

import knowflow.model.Note;
import knowflow.service.NoteService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * KnowFlow REST API — 笔记 & 分类控制器.
 *
 * 端点与 Python Flask 后端等价，前端可无缝切换.
 */
@RestController
@RequestMapping("/api")
public class NoteController {

    private final NoteService service;

    public NoteController(NoteService service) {
        this.service = service;
    }

    // ─── Health ─────────────────────────────────────

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "service", "KnowFlow API (Java)", "note_count", service.count());
    }

    // ─── Notes CRUD ─────────────────────────────────

    @GetMapping("/notes")
    public Map<String, Object> listNotes(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) Boolean favorite) {

        List<Note> notes = service.list(search, category, tag, favorite);
        return Map.of("notes", notes, "count", notes.size());
    }

    @GetMapping("/notes/{id}")
    public ResponseEntity<?> getNote(@PathVariable String id) {
        return service.get(id)
                .<ResponseEntity<?>>map(n -> ResponseEntity.ok(Map.of("note", n)))
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Note not found")));
    }

    @PostMapping("/notes")
    public ResponseEntity<?> createNote(@RequestBody(required = false) Note body) {
        if (body == null) return ResponseEntity.badRequest().body(Map.of("error", "Invalid JSON"));
        if (body.getTitle() == null || body.getTitle().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Title is required"));
        }
        Note created = service.create(body);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("note", created));
    }

    @PutMapping("/notes/{id}")
    public ResponseEntity<?> updateNote(@PathVariable String id, @RequestBody(required = false) Note body) {
        if (body == null) return ResponseEntity.badRequest().body(Map.of("error", "Invalid JSON"));
        return service.update(id, body)
                .<ResponseEntity<?>>map(n -> ResponseEntity.ok(Map.of("note", n)))
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Note not found")));
    }

    @DeleteMapping("/notes/{id}")
    public ResponseEntity<?> deleteNote(@PathVariable String id) {
        boolean deleted = service.delete(id);
        if (!deleted) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Note not found"));
        return ResponseEntity.ok(Map.of("message", "Note deleted"));
    }

    // ─── Categories ─────────────────────────────────

    @GetMapping("/categories")
    public Map<String, Object> listCategories() {
        return Map.of("categories", service.getCategories());
    }

    @PostMapping("/categories")
    public ResponseEntity<?> createCategory(@RequestBody Map<String, String> body) {
        String name = body != null ? body.get("name") : null;
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Category name is required"));
        }
        service.addCategory(name.trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("categories", service.getCategories()));
    }

    @DeleteMapping("/categories/{name}")
    public ResponseEntity<?> deleteCategory(@PathVariable String name) {
        service.removeCategory(name);
        return ResponseEntity.ok(Map.of("categories", service.getCategories()));
    }
}

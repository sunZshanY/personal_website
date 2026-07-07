package knowflow.service;

import knowflow.model.Note;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 笔记业务服务 — 基于 ConcurrentHashMap 的内存存储.
 * 生产环境可替换为 JPA / MongoDB 实现.
 */
@Service
public class NoteService {

    private final Map<String, Note> store = new ConcurrentHashMap<>();
    private final Set<String> categories = ConcurrentHashMap.newKeySet();

    // ─── CRUD ───────────────────────────────────────

    public List<Note> list(String search, String category, String tag, Boolean favorite) {
        return store.values().stream()
                .filter(n -> search == null || search.isBlank()
                        || n.getTitle().toLowerCase().contains(search.toLowerCase())
                        || n.getContent().toLowerCase().contains(search.toLowerCase())
                        || n.getTags().stream().anyMatch(t -> t.toLowerCase().contains(search.toLowerCase())))
                .filter(n -> category == null || category.isBlank()
                        || category.equals(n.getCategory()))
                .filter(n -> tag == null || tag.isBlank()
                        || n.getTags().contains(tag))
                .filter(n -> favorite == null || n.isFavorite() == favorite)
                .sorted((a, b) -> b.getUpdatedAt().compareTo(a.getUpdatedAt()))
                .collect(Collectors.toList());
    }

    public Optional<Note> get(String id) {
        return Optional.ofNullable(store.get(id));
    }

    public Note create(Note note) {
        if (note.getId() == null) note.setId(UUID.randomUUID().toString());
        String now = Instant.now().toString();
        note.setCreatedAt(now);
        note.setUpdatedAt(now);
        store.put(note.getId(), note);
        if (note.getCategory() != null && !note.getCategory().isBlank()) {
            categories.add(note.getCategory());
        }
        return note;
    }

    public Optional<Note> update(String id, Note patch) {
        Note existing = store.get(id);
        if (existing == null) return Optional.empty();

        if (patch.getTitle() != null) existing.setTitle(patch.getTitle());
        if (patch.getCategory() != null) {
            existing.setCategory(patch.getCategory());
            if (!patch.getCategory().isBlank()) categories.add(patch.getCategory());
        }
        if (patch.getContent() != null) existing.setContent(patch.getContent());
        if (patch.getTags() != null) existing.setTags(patch.getTags());
        existing.setFavorite(patch.isFavorite());
        existing.setUpdatedAt(Instant.now().toString());

        return Optional.of(existing);
    }

    public boolean delete(String id) {
        return store.remove(id) != null;
    }

    // ─── Categories ─────────────────────────────────

    public Set<String> getCategories() {
        // sync from notes
        store.values().forEach(n -> {
            if (n.getCategory() != null && !n.getCategory().isBlank()) {
                categories.add(n.getCategory());
            }
        });
        return Collections.unmodifiableSet(categories);
    }

    public void addCategory(String name) {
        if (name != null && !name.isBlank()) categories.add(name.trim());
    }

    public void removeCategory(String name) {
        categories.remove(name);
    }

    // ─── Stats ──────────────────────────────────────

    public int count() { return store.size(); }
}

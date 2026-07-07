package knowflow.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 笔记数据模型.
 * 与 Python / JavaScript 前端保持字段名一致 (camelCase).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Note {

    private String id;
    private String title;
    private String category;
    private String content;
    private List<String> tags = new ArrayList<>();
    private String createdAt;
    private String updatedAt;
    private boolean favorite;

    public Note() {
        this.id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        this.createdAt = now;
        this.updatedAt = now;
    }

    public Note(String title, String category, String content, List<String> tags) {
        this();
        this.title = title;
        this.category = category;
        this.content = content;
        this.tags = tags != null ? tags : new ArrayList<>();
    }

    // ─── Getters / Setters ──────────────────────────

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public boolean isFavorite() { return favorite; }
    public void setFavorite(boolean favorite) { this.favorite = favorite; }
}

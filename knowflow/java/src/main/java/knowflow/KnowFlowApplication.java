package knowflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * KnowFlow — 个人知识库 Spring Boot API 入口.
 *
 * 启动: mvn spring-boot:run
 * 默认端口: 5002 (见 application.properties)
 */
@SpringBootApplication
public class KnowFlowApplication {

    public static void main(String[] args) {
        SpringApplication.run(KnowFlowApplication.class, args);
    }
}

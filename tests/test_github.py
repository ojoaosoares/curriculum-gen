from curriculum_gen.ingestors.github import GitHubIngestor


def test_readme_parsing_metrics():
    ingestor = GitHubIngestor()
    sample_readme = """
    # MyCrawler
    A fast distributed web crawler.
    
    ## Performance & Results
    - Achieved a 73.3% reduction in peak memory usage.
    - Increased throughput from 0.6 to 9.6 pages/sec (16x increase).
    - Reduced tail latency by 45ms across 100k requests.
    """
    repo_data = {
        "name": "my-crawler",
        "description": "Distributed crawler in Python",
        "html_url": "https://github.com/user/my-crawler",
        "language": "Python",
        "topics": ["crawler", "concurrency"],
    }
    project = ingestor.parse_readme_for_project(repo_data, sample_readme)

    assert project.title == "my-crawler"
    assert "73.3%" in " ".join(project.metrics)
    assert "16x" in " ".join(project.metrics)
    assert len(project.raw_bullets) >= 2
    # Verify both description and README are captured in raw_bullets
    assert any("distributed crawler in python" in b.lower() for b in project.raw_bullets)
    assert any("73.3%" in b for b in project.raw_bullets)
    assert project.readme_content == sample_readme

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

    # Verify no false positive technologies like C, Go, React were inferred from normal words
    assert "C" not in project.tags
    assert "Go" not in project.tags
    assert "React" not in project.tags
    assert "C" not in (project.subtitle or "")
    assert "Go" not in (project.subtitle or "")


def test_readme_parsing_atesn_highlights_and_no_code_leak():
    ingestor = GitHubIngestor()
    atesn_readme = """
    # AtesN-DS 🚀
    [![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://travis-ci.org)

    AtesN-DS is a high-performance recursive DNS resolver built on eBPF that runs directly in the Linux kernel. By attaching to the XDP (eXpress Data Path) hook, it processes DNS queries at the network interface level, bypassing the kernel's network stack entirely.

    ```bash
    # bpftool debug dump
    243: array  name time_map  flags 0x0  offload 0
    sudo bpftool prog show --id 12
    ```

    | Benchmark | BIND | AtesN-DS |
    |---|---|---|
    | Latency | 1.2ms | 0.58ms |

    ## Architecture & Key Features
    - **Hardware Cache** (`dns_filter`) — an XDP program designed for NIC hardware offload. It serves cached DNS responses directly from eBPF maps at line rate, without touching the CPU.
    - **Zero-Copy Forwarding**: Direct packet transmission via XDP_TX for cached queries.

    ## Performance Benchmarks
    - Achieved a 51% latency reduction compared to standard recursive resolvers.
    - 213% throughput gain under synthetic DDoS query load, sustaining line-rate processing.
    """
    repo_data = {
        "name": "AtesN-DS",
        "description": "A high-performance recursive DNS resolver leveraging XDP and eBPF",
        "html_url": "https://github.com/user/AtesN-DS",
        "language": "C",
        "topics": ["ebpf", "xdp", "dns"],
    }
    project = ingestor.parse_readme_for_project(repo_data, atesn_readme)

    assert project.title == "AtesN-DS"
    # Metrics extracted
    assert "51%" in project.metrics
    assert "213%" in project.metrics

    # Bullets must NOT contain code dump or terminal syntax
    all_bullets_text = "\n".join(project.raw_bullets)
    assert "243: array" not in all_bullets_text
    assert "bpftool" not in all_bullets_text
    assert "```" not in all_bullets_text
    assert "🚀" not in all_bullets_text  # Sem emojis
    assert "**" not in all_bullets_text  # Markdown cleaned

    # Bullets should contain key highlights and benchmarks
    assert any("51%" in b for b in project.raw_bullets)
    assert any("213%" in b for b in project.raw_bullets)
    assert any("Hardware Cache" in b for b in project.raw_bullets)

    # Subtitle must contain verified technologies and NO false positives
    assert "C" in project.tags
    assert "eBPF" in project.tags
    assert "XDP" in project.tags
    assert "DNS" in project.tags
    assert "Go" not in project.tags
    assert "React" not in project.tags
    assert "Docker" not in project.tags
    assert "Go" not in (project.subtitle or "")
    assert "React" not in (project.subtitle or "")


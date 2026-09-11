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


def test_readme_parsing_atesn_smartnic_cache_offload_and_tables():
    ingestor = GitHubIngestor()
    atesn_full_readme = """
    # AtesN-DS: A High-Performance Hybrid Recursive DNS Resolver Leveraging XDP 🚀

    The system architecture is split into two complementary layers:
    - Kernel Resolver — A full recursive DNS resolver running in XDP generic or native mode. It executes the complete recursion lifecycle (querying root, TLD, and authoritative nameservers) and populates eBPF cache maps.
    - Hardware Cache (dns_filter) — An XDP program compiled for NIC hardware offload (SmartNIC). It serves cached DNS responses directly from hardware at line rate with zero host CPU involvement.

    1. AtesN-DS vs. State-of-the-Art (hyDNS)

    Comparative evaluations against state-of-the-art kernel-bypass solutions like hyDNS (ACM CoNEXT / SIGCOMM) demonstrate substantial performance gains:

        +213% Throughput: Achieves over 3× the query throughput of hyDNS.
        51% Latency Reduction: Cuts end-to-end query resolution latency by more than half.
        < 2% CPU Usage: Maintains negligible host CPU utilization throughout execution.

    Metric \thyDNS \tAtesN-DS \tAdvantage
    Throughput \tBaseline \t+213% \t~3.1× higher capacity
    Latency \tBaseline \t-51% \tCut by more than half
    Host CPU Utilization \tModerate \t< 2% \tMinimal host footprint

    2. Standalone Driver-Space vs. Hardware Cache Offload (SmartNIC)

    To evaluate the architecture under genuine Internet conditions, comprehensive empirical benchmarks were conducted on a physical testbed by replaying real-world enterprise DNS traffic traces captured in an active university campus network.

    Augmenting AtesN-DS with the hardware-offloaded cache layer (dns_filter) on a SmartNIC yields dramatic improvements over standalone driver-space execution:

        Up to 1.80× Throughput: Reaches a peak capacity of over 172,000 queries/s (10.35M queries/min), sustaining a 1.52× advantage even under peak stress of 16,384 concurrent connections.
        38.1% Latency Reduction: Lowers mean latency across workloads spanning up to 4,096 simultaneous connections.
        72.8% Hardware Hit Rate (Host Bypass): Filters over 7.5 million queries directly on the SmartNIC in complete host bypass, without waking the CPU.
        Extended Saturation Knee: Pushes the throughput-latency saturation knee beyond 166,000 queries/s.
        +120% to +141.6% Computational Efficiency: Sustains over 91,000 queries/s per 1% host CPU.
        36.5% SoftIRQ Reduction: Reduces kernel interrupt overhead while keeping global host CPU utilization strictly below 2.15% across all scenarios.
    """
    repo_data = {
        "name": "AtesN-DS",
        "description": "A High-Performance Hybrid Recursive DNS Resolver Leveraging XDP",
        "html_url": "https://github.com/user/AtesN-DS",
        "language": "C",
        "topics": ["ebpf", "xdp", "dns", "smartnic"],
    }
    project = ingestor.parse_readme_for_project(repo_data, atesn_full_readme)

    assert project.title == "AtesN-DS"
    # Ensure SmartNIC is recognized
    assert "SmartNIC" in project.tags

    # Metrics parsed correctly
    all_metrics = " ".join(project.metrics)
    assert "72.8%" in all_metrics
    assert "1.80×" in all_metrics or "1.80x" in all_metrics
    assert "213%" in all_metrics
    assert "51%" in all_metrics

    # Bullets must capture Overview, Architecture, and empirical benchmarks from both sections
    assert len(project.raw_bullets) == 4
    all_bullets = "\n".join(project.raw_bullets)

    # 1. Overview / description bullet
    assert any("Recursive DNS Resolver" in b for b in project.raw_bullets)

    # 2. Architecture bullet (cleanly extracted from author's text)
    assert any("Kernel Resolver" in b for b in project.raw_bullets)

    # 3. Hardware Cache Offload: 72.8% hit rate (SmartNIC host bypass)
    assert any("72.8%" in b and "SmartNIC" in b for b in project.raw_bullets)

    # 4. Comparative Evaluation vs hyDNS
    assert any("213%" in b for b in project.raw_bullets)

    # Bullets must NOT contain raw table lines, broken sentences, or emojis
    assert "Metric" not in all_bullets
    assert "\t" not in all_bullets
    assert "layers:." not in all_bullets
    assert "🚀" not in all_bullets
    assert not any(b.endswith(":") for b in project.raw_bullets)


def test_readme_parsing_web_microservice_payflow():
    ingestor = GitHubIngestor()
    web_readme = """
    # PayFlow: Payment Gateway Microservice

    PayFlow is a high-availability payment gateway service processing multi-currency transactions with idempotency guarantees.

    ## Key Features
    - Idempotent API endpoints with distributed Redis locks to prevent duplicate charges.
    - Real-time webhook delivery engine with exponential backoff and dead-letter queue.
    - PCI-DSS compliant tokenization pipeline using AES-256 GCM encryption.
    """
    repo_data = {
        "name": "payflow",
        "description": "Payment gateway microservice with distributed idempotency",
        "html_url": "https://github.com/user/payflow",
        "language": "TypeScript",
        "topics": ["typescript", "redis"],
    }
    project = ingestor.parse_readme_for_project(repo_data, web_readme)

    assert project.title == "payflow"
    assert "TypeScript" in project.tags
    assert "Redis" in project.tags
    assert len(project.raw_bullets) == 4
    # Overview bullet
    assert any("payment gateway microservice" in b.lower() for b in project.raw_bullets)
    # Feature bullets
    assert any("idempotent api endpoints" in b.lower() for b in project.raw_bullets)
    assert any("webhook delivery engine" in b.lower() for b in project.raw_bullets)
    assert any("tokenization pipeline" in b.lower() for b in project.raw_bullets)


def test_readme_parsing_rust_db_flashkv():
    ingestor = GitHubIngestor()
    rust_db_readme = """
    # FlashKV: High-Performance Embedded LSM Storage Engine

    FlashKV is an append-only embedded key-value store implemented in Rust, optimized for NVMe SSD random write workloads.

    ## Architecture
    - Two-tier MemTable with lock-free skiplist implementation and zero-copy write-ahead log (WAL).

    ## Benchmarks & Results
    - Achieved 420,000 ops/s write throughput on 16 concurrent threads (+84% speedup).
    - Reduced 99th percentile write latency from 8.2ms to 1.95ms (4.2x reduction).
    - 38% lower memory footprint under sustained compaction.
    """
    repo_data = {
        "name": "flash-kv",
        "description": "High-performance embedded LSM key-value store in Rust",
        "html_url": "https://github.com/user/flash-kv",
        "language": "Rust",
        "topics": ["rust", "database", "storage"],
    }
    project = ingestor.parse_readme_for_project(repo_data, rust_db_readme)

    assert project.title == "flash-kv"
    assert "Rust" in project.tags
    assert len(project.raw_bullets) == 4
    all_metrics = " ".join(project.metrics)
    assert "420,000 ops/s" in all_metrics
    assert "84%" in all_metrics
    assert "4.2x" in all_metrics or "4.2×" in all_metrics
    # Raw bullets check
    assert any("embedded lsm key-value store" in b.lower() for b in project.raw_bullets)
    assert any("memtable" in b.lower() for b in project.raw_bullets)
    assert any("420,000" in b for b in project.raw_bullets)




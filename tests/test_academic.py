from curriculum_gen.ingestors.academic import AcademicIngestor


def test_create_publication_item():
    item = AcademicIngestor.create_publication_item(
        title="High-Performance DNS Resolver via eBPF/XDP",
        venue="SBESC 2025",
        year="2025",
        abstract="A novel in-kernel DNS resolver achieving low latency.",
        url="https://sol.sbc.org.br/article/39485",
        tags=["eBPF", "XDP", "Networking"],
    )
    assert item.title == "High-Performance DNS Resolver via eBPF/XDP"
    assert "SBESC 2025" in item.description
    assert item.paper_abstract == "A novel in-kernel DNS resolver achieving low latency."
    assert "eBPF" in item.tags

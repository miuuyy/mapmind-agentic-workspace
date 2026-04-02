from app.models.domain import Edge, ResourceLink, StudyGraph, Topic, WorkspaceDocument, WorkspaceConfig, Zone


def build_empty_workspace(*, ui_language: str = "en") -> WorkspaceDocument:
    return WorkspaceDocument(
        active_graph_id=None,
        config=WorkspaceConfig(ui_language=ui_language),
        graphs=[],
        metadata={
            "seed": False,
            "personal": True,
        },
    )


def build_seed_workspace() -> WorkspaceDocument:
    demo_graph = StudyGraph(
        graph_id="mathematics-demo",
        subject="math",
        title="Mathematics demo",
        language="en",
        topics=[
            Topic(
                id="arithmetics",
                slug="arithmetics",
                title="Arithmetic and number sense",
                description="Core numeric intuition before algebra.",
                estimated_minutes=180,
                level=0,
                zones=["review-school"],
                resources=[
                    ResourceLink(
                        id="res-arith-khan",
                        label="Khan Academy",
                        url="https://www.khanacademy.org/math",
                    )
                ],
            ),
            Topic(
                id="angles",
                slug="angles",
                title="Angles and basic constructions",
                description="Core angle vocabulary and diagram reading.",
                estimated_minutes=150,
                level=0,
                zones=["review-school"],
            ),
            Topic(
                id="algebra-basics",
                slug="algebra-basics",
                title="Algebra basics",
                description="Variables, expressions, and equations.",
                estimated_minutes=240,
                level=1,
                zones=["review-school"],
            ),
            Topic(
                id="triangles",
                slug="triangles",
                title="Triangles",
                description="Triangle properties, congruence, and similarity.",
                estimated_minutes=260,
                level=1,
                zones=["review-school"],
            ),
            Topic(
                id="functions",
                slug="functions",
                title="Functions",
                description="Mappings, notation, graphs, and transformations.",
                estimated_minutes=300,
                level=2,
                zones=["review-school"],
            ),
            Topic(
                id="circles",
                slug="circles",
                title="Circles",
                description="Arcs, chords, tangents, and circle power intuition.",
                estimated_minutes=240,
                level=2,
                zones=["review-school"],
            ),
            Topic(
                id="linear-algebra",
                slug="linear-algebra",
                title="Linear algebra foundations",
                description="Vectors, matrices, and transformations for ML runway.",
                estimated_minutes=420,
                level=3,
                zones=["ml-runway"],
            ),
            Topic(
                id="vectors-geometry",
                slug="vectors-geometry",
                title="Vectors in geometry",
                description="Bridges synthetic geometry toward analytic geometry and ML geometry.",
                estimated_minutes=300,
                level=3,
                zones=["analytic-bridge"],
            ),
            Topic(
                id="embeddings",
                slug="embeddings",
                title="Embeddings",
                description="High-level ML target topic used as a future path anchor.",
                estimated_minutes=360,
                level=4,
                zones=["ml-runway"],
            ),
        ],
        edges=[
            Edge(
                id="edge-arith-algebra",
                source_topic_id="arithmetics",
                target_topic_id="algebra-basics",
                relation="requires",
                rationale="Arithmetic fluency supports symbolic manipulation.",
            ),
            Edge(
                id="edge-angles-triangles",
                source_topic_id="angles",
                target_topic_id="triangles",
                relation="requires",
                rationale="Triangle reasoning starts from angle fluency.",
            ),
            Edge(
                id="edge-algebra-functions",
                source_topic_id="algebra-basics",
                target_topic_id="functions",
                relation="requires",
                rationale="Functions depend on equations and symbolic expressions.",
            ),
            Edge(
                id="edge-triangles-circles",
                source_topic_id="triangles",
                target_topic_id="circles",
                relation="supports",
                rationale="Similarity and angle chasing help circle theorems.",
            ),
            Edge(
                id="edge-algebra-vectors",
                source_topic_id="algebra-basics",
                target_topic_id="vectors-geometry",
                relation="requires",
                rationale="Vector work in geometry still depends on symbolic algebra fluency.",
            ),
            Edge(
                id="edge-functions-la",
                source_topic_id="functions",
                target_topic_id="linear-algebra",
                relation="supports",
                rationale="Function intuition helps with transformations and mappings.",
            ),
            Edge(
                id="edge-circles-vectors",
                source_topic_id="circles",
                target_topic_id="vectors-geometry",
                relation="bridges",
                rationale="Diagram intuition transitions into analytic representation.",
            ),
            Edge(
                id="edge-vectors-la",
                source_topic_id="vectors-geometry",
                target_topic_id="linear-algebra",
                relation="supports",
                rationale="Geometric vector intuition strengthens the algebraic vector model.",
            ),
            Edge(
                id="edge-la-embeddings",
                source_topic_id="linear-algebra",
                target_topic_id="embeddings",
                relation="requires",
                rationale="Embeddings rely on vector spaces and linear representations.",
            ),
            Edge(
                id="edge-vectors-embeddings",
                source_topic_id="vectors-geometry",
                target_topic_id="embeddings",
                relation="supports",
                rationale="Geometric vector intuition helps embeddings feel less abstract.",
            ),
        ],
        zones=[
            Zone(
                id="review-school",
                title="Review",
                kind="review",
                color="#f2a65a",
                intensity=0.55,
                topic_ids=["arithmetics", "angles", "algebra-basics", "triangles", "functions", "circles"],
            ),
            Zone(
                id="analytic-bridge",
                title="Analytic bridge",
                kind="bridge",
                color="#76c7c0",
                intensity=0.74,
                topic_ids=["circles", "vectors-geometry", "linear-algebra"],
            ),
            Zone(
                id="ml-runway",
                title="ML runway",
                kind="goal",
                color="#ff6b6b",
                intensity=0.78,
                topic_ids=["linear-algebra", "embeddings"],
            ),
        ],
        metadata={
            "seed": True,
            "demo": True,
        },
    )
    return WorkspaceDocument(
        active_graph_id="mathematics-demo",
        config=WorkspaceConfig(),
        graphs=[demo_graph],
        metadata={
            "seed": True,
            "note": "Bootstrap workspace with a single starter-kit demo graph that can still be deleted by the user.",
        },
    )

"""Graph visualization endpoints."""

from typing import TypedDict

from fastapi import APIRouter

from app.api.tree_helpers import load_thread_tree
from app.config import PLANS_DIR
from app.db import mongo
from app.models.branch_point import BranchPoint
from app.models.concept_relationship import ConceptRelationship
from app.models.mastery import ConceptMastery
from app.models.thread import Thread
from app.plan_parser import parse_plan

router = APIRouter(prefix="/api", tags=["graph"])


# -- Thread-tree response shapes --


class TreeNode(TypedDict):
    thread_id: str
    title: str
    phase: str
    depth: int
    current_concept: str | None
    summary: str | None
    status: str
    progress: float | None
    first_question: str | None


class TreeEdge(TypedDict):
    source: str
    target: str
    source_concept: str | None
    branch_topic: str | None


class ThreadTreeResponse(TypedDict):
    nodes: list[TreeNode]
    edges: list[TreeEdge]


class ThreadTreeErrorResponse(TypedDict):
    error: str


# -- Knowledge-graph response shapes --


class _KGNodeRequired(TypedDict):
    name: str
    mastery_score: float
    strength_trend: str
    threads: list[str]
    last_reviewed: str | None
    domain: str
    source: str
    confidence: float
    description: str
    weak_subconcepts: list[str]
    node_type: str


class KGNode(_KGNodeRequired, total=False):
    display_name: str
    concept_count: int
    thread_phase: str
    thread_status: str
    thread_depth: int


class KGEdge(TypedDict):
    source: str
    target: str
    type: str
    weight: float


class KGStats(TypedDict):
    total_concepts: int
    mastered: int
    in_progress: int
    undiscovered: int
    domain_count: int
    edge_count: int


class KnowledgeGraphResponse(TypedDict):
    nodes: list[KGNode]
    edges: list[KGEdge]
    domains: list[str]
    stats: KGStats


# -- Helpers --


def _thread_plan_info(topic_slug: str | None) -> tuple[float | None, str | None]:
    """Compute plan progress and current concept for a thread.
    Returns (progress, current_concept). Both None if no plan exists."""
    if not topic_slug:
        return None, None
    plan_path = PLANS_DIR / topic_slug / "plan.md"
    if not plan_path.exists():
        return None, None
    tree = parse_plan(plan_path.read_text())
    first = tree.first_uncompleted_concept()
    return round(tree.overall_progress, 2), (first.name if first else None)


def _branch_points_by_child(thread_ids: list[str]) -> dict[str, BranchPoint]:
    """Map child_thread_id → branch point for a set of threads."""
    docs = mongo.branch_points().find({"thread_id": {"$in": thread_ids}})
    return {
        bp.child_thread_id: bp
        for raw in docs
        if (bp := BranchPoint.model_validate(raw))
    }


def _first_user_messages(thread_ids: list[str]) -> dict[str, str]:
    """Return first user message (truncated) per thread."""
    pipeline: list[dict[str, object]] = [
        {"$match": {"thread_id": {"$in": thread_ids}, "role": "user", "type": {"$in": ["text", "markdown"]}}},
        {"$sort": {"created_at": 1}},
        {"$group": {"_id": "$thread_id", "content": {"$first": "$content"}}},
    ]
    result: dict[str, str] = {}
    for doc in mongo.messages().aggregate(pipeline):
        content = str(doc.get("content", ""))
        result[doc["_id"]] = content[:120] + ("..." if len(content) > 120 else "")
    return result


# -- Endpoints --


@router.get("/threads/{thread_id}/tree")
def get_thread_tree(thread_id: str) -> ThreadTreeResponse | ThreadTreeErrorResponse:
    """Return the full thread tree as an adjacency list (nodes + edges)."""
    root_id, thread_map, by_parent = load_thread_tree(thread_id)
    if not root_id:
        return ThreadTreeErrorResponse(error="Thread not found")

    all_ids = list(thread_map.keys())
    bp_by_child = _branch_points_by_child(all_ids)
    first_questions = _first_user_messages(all_ids)

    nodes: list[TreeNode] = []
    edges: list[TreeEdge] = []

    def walk(tid: str) -> None:
        t = thread_map.get(tid)
        if not t:
            return
        progress, current_concept = _thread_plan_info(t.topic_slug)
        nodes.append(TreeNode(
            thread_id=tid,
            title=t.title,
            phase=t.phase,
            depth=t.depth,
            current_concept=current_concept,
            summary=t.summary,
            status=t.status,
            progress=progress,
            first_question=first_questions.get(tid),
        ))
        for cid in by_parent.get(tid, []):
            bp = bp_by_child.get(cid)
            edges.append(TreeEdge(
                source=tid,
                target=cid,
                source_concept=bp.source_concept if bp else None,
                branch_topic=bp.branch_topic if bp else None,
            ))
            walk(cid)

    walk(root_id)
    return ThreadTreeResponse(nodes=nodes, edges=edges)


@router.get("/knowledge-graph")
def get_knowledge_graph(user_id: str = "user_001", domain: str | None = None) -> KnowledgeGraphResponse:
    """Return the learner's knowledge graph: concept nodes + relationship edges.

    Includes topic hub nodes that group concepts by domain, plus stats.
    """
    import logging
    _log = logging.getLogger(__name__)

    query: dict[str, str] = {"user_id": user_id}
    if domain:
        query["domain"] = domain

    def _coerce_id(doc: dict) -> dict:
        """Ensure _id is a string (MongoDB may store it as ObjectId)."""
        if not isinstance(doc.get("_id"), str):
            doc["_id"] = str(doc["_id"])
        return doc

    concept_models: list[ConceptMastery] = []
    for doc in mongo.concept_mastery().find(query):
        try:
            concept_models.append(ConceptMastery.model_validate(_coerce_id(doc)))
        except Exception as e:
            _log.warning("Skipping invalid concept_mastery doc %s: %s", doc.get("_id"), e)

    rel_models: list[ConceptRelationship] = []
    for doc in mongo.concept_relationships().find({"user_id": user_id}):
        try:
            rel_models.append(ConceptRelationship.model_validate(_coerce_id(doc)))
        except Exception as e:
            _log.warning("Skipping invalid concept_relationship doc %s: %s", doc.get("_id"), e)

    concept_names = {cm.concept_name for cm in concept_models}

    # Build thread lookup once per domain (avoid N+1)
    domain_threads: dict[str, list[str]] = {}
    seen_domains: set[str] = set()
    for cm in concept_models:
        d = cm.domain
        if d and d not in seen_domains:
            seen_domains.add(d)
            thread_docs = mongo.threads().find({"topic_slug": d}, {"_id": 1})
            domain_threads[d] = [str(t["_id"]) for t in thread_docs]

    # Group concepts by domain for hub nodes
    domain_concepts: dict[str, list[KGNode]] = {}

    # Build concept list (always needed for stats + hub aggregation)
    all_concept_nodes: list[KGNode] = []
    for cm in concept_models:
        node = KGNode(
            name=cm.concept_name,
            mastery_score=cm.mastery_score,
            strength_trend=cm.strength_trend,
            threads=domain_threads.get(cm.domain, []),
            last_reviewed=str(cm.last_reviewed) if cm.last_reviewed else None,
            domain=cm.domain,
            source=cm.source,
            confidence=cm.confidence,
            description=cm.description,
            weak_subconcepts=cm.weak_subconcepts,
            node_type="concept",
        )
        all_concept_nodes.append(node)
        domain_concepts.setdefault(cm.domain, []).append(node)

    # Only include individual concept nodes when a domain filter is active
    nodes: list[KGNode] = list(all_concept_nodes) if domain else []

    edges: list[KGEdge] = []
    # Only include concept-to-concept edges when drilling into a domain
    if domain:
        for rel in rel_models:
            if rel.from_concept not in concept_names or rel.to_concept not in concept_names:
                continue
            edges.append(KGEdge(
                source=rel.from_concept,
                target=rel.to_concept,
                type=rel.type,
                weight=0.3 if rel.type == "prerequisite_of" else rel.weight,
            ))

    # Create topic hub nodes — one per domain
    for d, concepts in domain_concepts.items():
        if not d:
            continue
        avg_mastery = sum(c["mastery_score"] for c in concepts) / len(concepts) if concepts else 0
        hub_name = f"hub:{d}"
        nodes.append(KGNode(
            name=hub_name,
            mastery_score=round(avg_mastery, 2),
            strength_trend="stable",
            threads=domain_threads.get(d, []),
            last_reviewed=None,
            domain=d,
            source="plan",
            confidence=1.0,
            description=f"{len(concepts)} concepts",
            weak_subconcepts=[],
            node_type="topic_hub",
            display_name=d.replace("-", " ").title(),
            concept_count=len(concepts),
        ))
        # Connect concepts to their topic hub (only when drilling in)
        if domain:
            for concept in concepts:
                edges.append(KGEdge(
                    source=hub_name,
                    target=concept["name"],
                    type="part_of",
                    weight=0.6,
                ))

    # Build phase→concepts mapping from plan (used to connect threads to concepts)
    phase_concepts: dict[str, list[str]] = {}  # phase_title → [concept_name, ...]
    if domain:
        plan_path = PLANS_DIR / domain / "plan.md"
        if plan_path.exists():
            plan_tree = parse_plan(plan_path.read_text())
            for phase in plan_tree.phases:
                phase_concepts[phase.title] = [c.name for c in phase.concepts]

    # Add thread nodes (filter by domain when drilling in)
    thread_query: dict[str, str] = {} if user_id == "user_001" else {"user_id": user_id}
    if domain:
        thread_query["topic_slug"] = domain
    thread_models: list[Thread] = []
    for doc in mongo.threads().find(thread_query):
        try:
            thread_models.append(Thread.model_validate(_coerce_id(doc)))
        except Exception as e:
            _log.warning("Skipping invalid thread doc %s: %s", doc.get("_id"), e)
    for t in thread_models:
        tid = t.id
        t_hub = f"hub:{t.topic_slug}" if t.topic_slug else None
        nodes.append(KGNode(
            name=f"thread:{tid}",
            mastery_score=0,
            strength_trend="stable",
            threads=[tid],
            last_reviewed=None,
            domain=t.topic_slug,
            source="plan",
            confidence=1.0,
            description=t.summary or "",
            weak_subconcepts=[],
            node_type="thread",
            display_name=t.title[:40],
            concept_count=0,
            thread_phase=t.phase,
            thread_status=t.status,
            thread_depth=t.depth,
        ))
        # Connect thread to its topic hub
        if t_hub and t.topic_slug in domain_concepts:
            edges.append(KGEdge(
                source=t_hub,
                target=f"thread:{tid}",
                type="explored_from",
                weight=0.5,
            ))
        # Connect thread to concepts it covers
        if domain:
            thread_concept_names: set[str] = set()
            # From current_concept
            if t.current_concept and t.current_concept in concept_names:
                thread_concept_names.add(t.current_concept)
            # From plan phase mapping (thread title is "Phase N: Title")
            for phase_title, concepts_in_phase in phase_concepts.items():
                if phase_title in (t.title or ""):
                    for cn in concepts_in_phase:
                        if cn in concept_names:
                            thread_concept_names.add(cn)
            for cn in thread_concept_names:
                edges.append(KGEdge(
                    source=f"thread:{tid}",
                    target=cn,
                    type="explored_from",
                    weight=0.7,
                ))

    domains = sorted(domain_concepts.keys())

    # Central "Rabbithole Memory" node — connects to all topic hubs
    if not domain and len(domain_concepts) > 0:
        overall_avg = (
            sum(cm.mastery_score for cm in concept_models) / len(concept_models)
            if concept_models else 0
        )
        nodes.append(KGNode(
            name="rabbithole-memory",
            mastery_score=round(overall_avg, 2),
            strength_trend="stable",
            threads=[],
            last_reviewed=None,
            domain="",
            source="plan",
            confidence=1.0,
            description=f"{len(concept_models)} concepts across {len([d for d in domains if d])} topics",
            weak_subconcepts=[],
            node_type="memory_hub",
            display_name="Rabbithole Memory",
            concept_count=len(concept_models),
        ))
        # Connect memory hub to each topic hub
        for d in domain_concepts:
            if not d:
                continue
            edges.append(KGEdge(
                source="rabbithole-memory",
                target=f"hub:{d}",
                type="part_of",
                weight=0.8,
            ))

    # Stats
    total = len(concept_models)
    mastered = sum(1 for cm in concept_models if cm.mastery_score >= 0.7)
    in_progress = sum(1 for cm in concept_models if 0 < cm.mastery_score < 0.7)

    return KnowledgeGraphResponse(
        nodes=nodes,
        edges=edges,
        domains=[d for d in domains if d],
        stats=KGStats(
            total_concepts=total,
            mastered=mastered,
            in_progress=in_progress,
            undiscovered=total - mastered - in_progress,
            domain_count=len([d for d in domains if d]),
            edge_count=len(edges),
        ),
    )

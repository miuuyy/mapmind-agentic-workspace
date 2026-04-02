from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.domain import StudyGraph


class RenameGraphRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class GraphLayoutPositionRequest(BaseModel):
    x: float
    y: float


class UpdateGraphLayoutRequest(BaseModel):
    positions: dict[str, GraphLayoutPositionRequest]


class TopicResourceInput(BaseModel):
    url: str = Field(min_length=1, max_length=4000)


class TopicArtifactInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    body: str = Field(min_length=1, max_length=12000)


class CreateSessionRequest(BaseModel):
    topic_id: str | None = None
    title: str | None = None


class GraphExportRequest(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    include_progress: bool = True


class GraphExportPackage(BaseModel):
    kind: str = "mapmind_graph_export"
    version: int = 1
    exported_at: str
    source_graph_id: str
    title: str
    include_progress: bool
    graph: StudyGraph


class GraphImportRequest(BaseModel):
    package: GraphExportPackage
    title: str | None = Field(default=None, max_length=120)
    include_progress: bool = True

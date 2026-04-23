from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException

from app.core.config import Settings, get_settings
from app.services.assessment_service import AssessmentService
from app.services.debug_log_service import get_debug_log_service
from app.services.proposal_normalizer import ProposalNormalizer
from app.services.repository import GraphRepository

if TYPE_CHECKING:
    from app.services.chat_orchestrator import ChatOrchestratorService
    from app.services.proposal_planner import ProposalPlanner
    from app.services.quiz_service import QuizService
    from app.services.study_assistant import StudyAssistantService


def get_repository(settings: Settings = Depends(get_settings)) -> GraphRepository:
    return GraphRepository(settings.db_path)


def get_effective_settings(
    settings: Settings = Depends(get_settings),
    repository: GraphRepository = Depends(get_repository),
) -> Settings:
    workspace_config = repository.current().workspace.config
    return settings.with_workspace_overrides(workspace_config)


def get_planner(settings: Settings = Depends(get_effective_settings)) -> "ProposalPlanner":
    from app.services.proposal_planner import ProposalPlanner, ProposalPlannerError

    try:
        return ProposalPlanner(settings)
    except ProposalPlannerError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def get_normalizer() -> ProposalNormalizer:
    return ProposalNormalizer()


def get_quiz_service(settings: Settings = Depends(get_effective_settings)) -> "QuizService":
    from app.services.quiz_service import QuizService

    return QuizService(settings)


def get_assessment_service() -> AssessmentService:
    return AssessmentService()


def get_study_assistant(settings: Settings = Depends(get_effective_settings)) -> "StudyAssistantService":
    from app.services.study_assistant import StudyAssistantService

    return StudyAssistantService(settings)


def get_chat_orchestrator(
    settings: Settings = Depends(get_effective_settings),
    planner: "ProposalPlanner" = Depends(get_planner),
) -> "ChatOrchestratorService":
    from app.services.chat_orchestrator import ChatOrchestratorService

    return ChatOrchestratorService(settings, planner)


def get_debug_logs(settings: Settings = Depends(get_settings)):
    return get_debug_log_service(settings.root_dir)


def ensure_debug_logs_enabled(repository: GraphRepository = Depends(get_repository)) -> None:
    if not repository.current().workspace.config.debug_mode_enabled:
        raise HTTPException(status_code=403, detail="debug logs are disabled")

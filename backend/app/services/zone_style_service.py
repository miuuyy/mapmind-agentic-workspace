from __future__ import annotations

from hashlib import sha1
import re

from app.models.domain import StudyGraph, WorkspaceDocument, Zone


_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_ZONE_STYLE_PALETTE: tuple[tuple[str, float], ...] = (
    ("#f2a65a", 0.55),
    ("#76c7c0", 0.74),
    ("#ff6b6b", 0.78),
    ("#4a90e2", 0.58),
    ("#50e3c2", 0.64),
    ("#f5a623", 0.68),
    ("#d0021b", 0.76),
    ("#8b5cf6", 0.72),
    ("#14b8a6", 0.66),
    ("#84cc16", 0.63),
    ("#06b6d4", 0.62),
    ("#ec4899", 0.71),
    ("#ef4444", 0.69),
    ("#3b82f6", 0.61),
    ("#10b981", 0.65),
    ("#a855f7", 0.73),
)


def resolve_zone_style(zone_id: str, zone_map: dict[str, Zone], *, graph_id: str) -> tuple[str, float]:
    current = zone_map.get(zone_id)
    if current is not None and _is_hex_color(current.color):
        return current.color, current.intensity
    occupied_styles = {
        (zone.color, _normalized_intensity(zone.intensity))
        for existing_zone_id, zone in zone_map.items()
        if existing_zone_id != zone_id and _is_hex_color(zone.color)
    }
    return _allocate_style(graph_id=graph_id, zone_id=zone_id, occupied_styles=occupied_styles)


def normalize_workspace_zone_styles(workspace: WorkspaceDocument) -> bool:
    changed = False
    for graph in workspace.graphs:
        occupied_styles: set[tuple[str, float]] = set()
        assigned_styles: dict[str, tuple[str, float]] = {}
        for zone in graph.zones:
            if _is_hex_color(zone.color):
                style = (zone.color, zone.intensity)
                occupied_styles.add((zone.color, _normalized_intensity(zone.intensity)))
                assigned_styles[zone.id] = style
                continue
            style = assigned_styles.get(zone.id)
            if style is None:
                style = _allocate_style(
                    graph_id=graph.graph_id,
                    zone_id=zone.id,
                    occupied_styles=occupied_styles,
                )
                assigned_styles[zone.id] = style
                occupied_styles.add((style[0], _normalized_intensity(style[1])))
            if zone.color != style[0] or zone.intensity != style[1]:
                zone.color, zone.intensity = style
                changed = True
    return changed


def _allocate_style(
    *,
    graph_id: str,
    zone_id: str,
    occupied_styles: set[tuple[str, float]],
) -> tuple[str, float]:
    if not _ZONE_STYLE_PALETTE:
        return "#94a3b8", 0.6
    digest = sha1(f"{graph_id}:{zone_id}".encode("utf-8")).digest()
    start_index = int.from_bytes(digest[:2], "big") % len(_ZONE_STYLE_PALETTE)
    for offset in range(len(_ZONE_STYLE_PALETTE)):
        color, intensity = _ZONE_STYLE_PALETTE[(start_index + offset) % len(_ZONE_STYLE_PALETTE)]
        key = (color, _normalized_intensity(intensity))
        if key not in occupied_styles:
            return color, intensity
    return _ZONE_STYLE_PALETTE[start_index]


def _is_hex_color(value: str | None) -> bool:
    if not isinstance(value, str):
        return False
    return bool(_HEX_COLOR_RE.fullmatch(value.strip()))


def _normalized_intensity(value: float) -> float:
    return round(float(value), 4)

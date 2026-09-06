#!/usr/bin/env python3
"""Render the three Map Routing UML figures used by the individual report.

The renderer intentionally has no runtime inputs.  Keeping the drawing code in one
small, deterministic Pillow script makes it safe to re-create the exact PNGs before
uploading them to Google Docs.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "diagrams"

WIDTH = 2600
HEIGHT = 1960

BLACK = (20, 28, 36)
MID_GREY = (91, 105, 116)
WHITE = (255, 255, 255)
PALE_BLUE = (218, 238, 249)
PALE_BLUE_DARK = (194, 224, 241)
PALE_YELLOW = (255, 248, 214)
PALE_GREEN = (226, 244, 231)
PALE_RED = (255, 232, 232)
BOX_BLUE = (247, 252, 255)
BOX_GREY = (247, 249, 250)

STROKE = 5
THIN_STROKE = 3


def _font_candidates(filename: str) -> Iterable[Path]:
    """Yield stable DejaVu font locations used by the bundled runtime first."""

    bundled_root = Path(
        "/Users/tanzhengyang/.cache/codex-runtimes/codex-primary-runtime/"
        "dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/"
        "Contents/Resources/fonts/truetype"
    )
    yield bundled_root / filename
    yield Path("/usr/share/fonts/truetype/dejavu") / filename
    yield Path("/Library/Fonts") / filename
    yield Path("/System/Library/Fonts/Supplemental") / filename


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    filename = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for candidate in _font_candidates(filename):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    raise FileNotFoundError(f"Could not locate required font {filename}")


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> int:
    left, _, right, _ = draw.textbbox((0, 0), text, font=font)
    return right - left


def wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    max_width: int,
) -> list[str]:
    """Wrap text at word boundaries, preserving deliberate newlines."""

    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if text_width(draw, candidate, font) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] = BLACK,
    spacing: int = 8,
    max_width: int | None = None,
) -> None:
    x0, y0, x1, y1 = box
    available = max_width if max_width is not None else x1 - x0
    lines = wrap_text(draw, text, font, available)
    line_heights = []
    for line in lines:
        left, top, right, bottom = draw.textbbox((0, 0), line or " ", font=font)
        line_heights.append(bottom - top)
    total_height = sum(line_heights) + spacing * max(0, len(lines) - 1)
    cursor_y = (y0 + y1 - total_height) / 2
    for line, line_height in zip(lines, line_heights):
        line_width = text_width(draw, line, font)
        cursor_x = x0 + (x1 - x0 - line_width) / 2
        draw.text((cursor_x, cursor_y), line, font=font, fill=fill)
        cursor_y += line_height + spacing


def draw_left_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] = BLACK,
    spacing: int = 8,
) -> None:
    x0, y0, x1, y1 = box
    lines = wrap_text(draw, text, font, x1 - x0)
    line_heights = [
        draw.textbbox((0, 0), line or " ", font=font)[3]
        - draw.textbbox((0, 0), line or " ", font=font)[1]
        for line in lines
    ]
    total_height = sum(line_heights) + spacing * max(0, len(lines) - 1)
    cursor_y = y0 + max(0, (y1 - y0 - total_height) / 2)
    for line, line_height in zip(lines, line_heights):
        draw.text((x0, cursor_y), line, font=font, fill=fill)
        cursor_y += line_height + spacing


def rounded_activity(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    *,
    fill: tuple[int, int, int] = BOX_BLUE,
    outline: tuple[int, int, int] = BLACK,
    font: ImageFont.FreeTypeFont,
    dashed: bool = False,
) -> tuple[int, int, int, int]:
    if dashed:
        draw_dashed_rectangle(draw, box, outline, width=STROKE)
        draw.rounded_rectangle(box, radius=25, fill=fill)
        draw_dashed_rectangle(draw, box, outline, width=STROKE)
    else:
        draw.rounded_rectangle(box, radius=25, fill=fill, outline=outline, width=STROKE)
    draw_centered_text(draw, box, text, font, max_width=(box[2] - box[0] - 44))
    return box


def draw_dashed_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    fill: tuple[int, int, int] = BLACK,
    width: int = STROKE,
    dash: int = 18,
    gap: int = 11,
) -> None:
    x0, y0 = start
    x1, y1 = end
    distance = math.hypot(x1 - x0, y1 - y0)
    if distance == 0:
        return
    ux = (x1 - x0) / distance
    uy = (y1 - y0) / distance
    cursor = 0.0
    while cursor < distance:
        segment_end = min(cursor + dash, distance)
        a = (x0 + ux * cursor, y0 + uy * cursor)
        b = (x0 + ux * segment_end, y0 + uy * segment_end)
        draw.line((a, b), fill=fill, width=width)
        cursor += dash + gap


def draw_dashed_rectangle(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int] = BLACK,
    width: int = STROKE,
    dash: int = 20,
    gap: int = 12,
) -> None:
    x0, y0, x1, y1 = box
    for start, end in (
        ((x0, y0), (x1, y0)),
        ((x1, y0), (x1, y1)),
        ((x1, y1), (x0, y1)),
        ((x0, y1), (x0, y0)),
    ):
        draw_dashed_line(draw, start, end, fill=fill, width=width, dash=dash, gap=gap)


def draw_arrow_head(
    draw: ImageDraw.ImageDraw,
    previous: tuple[float, float],
    tip: tuple[float, float],
    *,
    fill: tuple[int, int, int] = BLACK,
    size: float = 18,
) -> None:
    px, py = previous
    tx, ty = tip
    length = math.hypot(tx - px, ty - py)
    if length == 0:
        return
    ux = (tx - px) / length
    uy = (ty - py) / length
    nx = -uy
    ny = ux
    left = (tx - ux * size + nx * size * 0.62, ty - uy * size + ny * size * 0.62)
    right = (tx - ux * size - nx * size * 0.62, ty - uy * size - ny * size * 0.62)
    draw.polygon((tip, left, right), fill=fill)


def draw_open_arrow_head(
    draw: ImageDraw.ImageDraw,
    previous: tuple[float, float],
    tip: tuple[float, float],
    *,
    fill: tuple[int, int, int] = BLACK,
    size: float = 18,
    width: int = STROKE,
) -> None:
    """Draw the open dependency arrowhead used by UML include/extend links."""

    px, py = previous
    tx, ty = tip
    length = math.hypot(tx - px, ty - py)
    if length == 0:
        return
    ux = (tx - px) / length
    uy = (ty - py) / length
    nx = -uy
    ny = ux
    left = (tx - ux * size + nx * size * 0.62, ty - uy * size + ny * size * 0.62)
    right = (tx - ux * size - nx * size * 0.62, ty - uy * size - ny * size * 0.62)
    draw.line((left, tip, right), fill=fill, width=width, joint="curve")


def draw_polyline_arrow(
    draw: ImageDraw.ImageDraw,
    points: Sequence[tuple[float, float]],
    *,
    dashed: bool = False,
    fill: tuple[int, int, int] = BLACK,
    width: int = STROKE,
    arrow_size: float = 18,
    open_head: bool = False,
) -> None:
    if len(points) < 2:
        return
    for start, end in zip(points, points[1:]):
        if dashed:
            draw_dashed_line(draw, start, end, fill=fill, width=width)
        else:
            draw.line((start, end), fill=fill, width=width, joint="curve")
    if open_head:
        draw_open_arrow_head(
            draw,
            points[-2],
            points[-1],
            fill=fill,
            size=arrow_size,
            width=width,
        )
    else:
        draw_arrow_head(draw, points[-2], points[-1], fill=fill, size=arrow_size)


def draw_label_on_line(
    draw: ImageDraw.ImageDraw,
    position: tuple[int, int],
    text: str,
    *,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] = BLACK,
    background: tuple[int, int, int] = WHITE,
    padding: int = 7,
) -> None:
    x, y = position
    left, top, right, bottom = draw.textbbox((x, y), text, font=font)
    draw.rounded_rectangle(
        (left - padding, top - padding, right + padding, bottom + padding),
        radius=8,
        fill=background,
    )
    draw.text((x, y), text, font=font, fill=fill)


def draw_actor(
    draw: ImageDraw.ImageDraw,
    center_x: int,
    top_y: int,
    label: str,
    *,
    font: ImageFont.FreeTypeFont,
) -> tuple[float, float, float, float]:
    head_radius = 36
    head_center = (center_x, top_y + head_radius)
    draw.ellipse(
        (
            center_x - head_radius,
            top_y,
            center_x + head_radius,
            top_y + head_radius * 2,
        ),
        fill=WHITE,
        outline=BLACK,
        width=STROKE,
    )
    shoulder_y = top_y + head_radius * 2 + 26
    hip_y = shoulder_y + 112
    draw.line((center_x, shoulder_y, center_x, hip_y), fill=BLACK, width=STROKE)
    draw.line((center_x - 82, shoulder_y + 32, center_x + 82, shoulder_y + 32), fill=BLACK, width=STROKE)
    draw.line((center_x, hip_y, center_x - 72, hip_y + 110), fill=BLACK, width=STROKE)
    draw.line((center_x, hip_y, center_x + 72, hip_y + 110), fill=BLACK, width=STROKE)
    label_box = (center_x - 180, hip_y + 125, center_x + 180, hip_y + 220)
    draw_centered_text(draw, label_box, label, font)
    return (center_x - 95, shoulder_y + 30, center_x + 95, hip_y + 40)


def draw_ellipse_use_case(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    *,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] = BOX_BLUE,
) -> tuple[int, int, int, int]:
    draw.ellipse(box, fill=fill, outline=BLACK, width=STROKE)
    draw_centered_text(draw, box, text, font, max_width=box[2] - box[0] - 72)
    return box


def draw_decision(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    size: tuple[int, int],
    text: str,
    *,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] = PALE_YELLOW,
) -> tuple[tuple[int, int], ...]:
    cx, cy = center
    half_w, half_h = size[0] // 2, size[1] // 2
    points = ((cx, cy - half_h), (cx + half_w, cy), (cx, cy + half_h), (cx - half_w, cy))
    draw.polygon(points, fill=fill, outline=BLACK)
    draw.line((points[-1], points[0], points[1], points[2], points[3]), fill=BLACK, width=STROKE, joint="curve")
    draw_centered_text(
        draw,
        (cx - half_w + 28, cy - half_h + 26, cx + half_w - 28, cy + half_h - 26),
        text,
        font,
        max_width=size[0] - 56,
    )
    return points


def draw_lane_frame(
    draw: ImageDraw.ImageDraw,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    header: str,
    *,
    header_font: ImageFont.FreeTypeFont,
) -> None:
    header_height = 118
    draw.rectangle((x0, y0, x1, y1), fill=WHITE, outline=BLACK, width=STROKE)
    draw.rectangle((x0, y0, x1, y0 + header_height), fill=PALE_BLUE)
    draw.line((x0, y0 + header_height, x1, y0 + header_height), fill=BLACK, width=STROKE)
    draw_centered_text(draw, (x0 + 16, y0 + 12, x1 - 16, y0 + header_height - 12), header, header_font, spacing=5)


def new_canvas(title: str, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(image)
    draw.text((70, 38), title, font=load_font(46, bold=True), fill=BLACK)
    draw.text((72, 98), subtitle, font=load_font(25), fill=MID_GREY)
    return image, draw


def draw_activity_lanes(draw: ImageDraw.ImageDraw, *, title_suffix: str) -> None:
    y0 = 170
    y1 = HEIGHT - 66
    draw_lane_frame(draw, 68, y0, 850, y1, "Guest /\nRegistered User", header_font=load_font(30, bold=True))
    draw_lane_frame(draw, 850, y0, 1660, y1, "TrueBites\nFrontend", header_font=load_font(30, bold=True))
    draw_lane_frame(
        draw,
        1660,
        y0,
        WIDTH - 68,
        y1,
        "Map Routing Backend /\nOSRM",
        header_font=load_font(30, bold=True),
    )
    draw.text((WIDTH - 510, 48), title_suffix, font=load_font(25, bold=True), fill=MID_GREY)


def plan_activity_routes() -> dict[str, list[tuple[int, int]]]:
    """Return the long plan-activity connectors that need dedicated gutters."""

    return {
        "gps_to_edit": [(925, 572), (780, 572)],
        "backend_invalid_to_error": [(1975, 1265), (1585, 1265)],
        "display_to_review": [
            (1255, 1740),
            (1255, 1760),
            (457, 1760),
            (457, 1780),
        ],
        "validation_error_retry": [
            (1255, 1340),
            (1255, 1380),
            (95, 1380),
            (95, 572),
            (135, 572),
        ],
    }


def optimize_activity_routes() -> dict[str, list[tuple[int, int]]]:
    """Return optimization connectors with distinct retry channels."""

    return {
        "validation_invalid_to_error": [(1975, 615), (1585, 615)],
        "osrm_failure_to_error": [(1975, 1055), (1585, 1055)],
        "render_to_review": [
            (1255, 1360),
            (1255, 1400),
            (457, 1400),
            (457, 1450),
        ],
        "validation_failure_retry": [
            (925, 620),
            (820, 620),
            (820, 480),
            (457, 480),
            (457, 455),
        ],
        "processing_failure_to_return": [
            (1585, 1055),
            (1600, 1055),
            (1600, 1760),
            (780, 1760),
        ],
    }


def render_use_case() -> Path:
    image, draw = new_canvas(
        "Map Routing — Use-Case Diagram",
        "TrueBites functional scope • actor associations and optional extension",
    )
    boundary = (650, 205, 1950, 1800)
    draw.rounded_rectangle(boundary, radius=28, fill=(252, 254, 255), outline=BLACK, width=STROKE)
    draw.text((710, 248), "TrueBites — Map Routing", font=load_font(36, bold=True), fill=BLACK)
    draw.line((710, 314, 1888, 314), fill=PALE_BLUE_DARK, width=3)

    actor_font = load_font(31, bold=True)
    actor_guest = draw_actor(draw, 305, 735, "Guest", font=actor_font)
    actor_registered = draw_actor(draw, 2295, 735, "Registered User", font=actor_font)

    base = draw_ellipse_use_case(
        draw,
        (865, 565, 1735, 805),
        "Plan Multi-Stop Trip",
        font=load_font(36, bold=True),
        fill=PALE_GREEN,
    )
    optimize = draw_ellipse_use_case(
        draw,
        (895, 1110, 1705, 1340),
        "Optimize Stop Order",
        font=load_font(34, bold=True),
        fill=PALE_YELLOW,
    )

    # Associations terminate at the ellipse boundary and do not enter labels.
    draw_polyline_arrow(draw, [(400, 900), (690, 900), (690, 685), (865, 685)], width=STROKE, arrow_size=0)
    draw_polyline_arrow(draw, [(2200, 900), (1905, 900), (1905, 685), (1735, 685)], width=STROKE, arrow_size=0)

    # The extension points upward to the base use case as required by UML.
    draw_polyline_arrow(
        draw,
        [(1300, 1110), (1300, 1000), (1300, 805)],
        dashed=True,
        width=STROKE,
        arrow_size=22,
        open_head=True,
    )
    draw_label_on_line(draw, (1340, 920), "«extend»", font=load_font(27, bold=True))

    path = OUTPUT_DIR / "map-routing-use-case.png"
    image.save(path, format="PNG", optimize=False, compress_level=9)
    return path


def render_plan_activity() -> Path:
    image, draw = new_canvas(
        "Map Routing — Plan Multi-Stop Trip",
        "Activity diagram • opening the map, collecting stops, requesting and reviewing a route",
    )
    draw_activity_lanes(draw, title_suffix="Plan Multi-Stop Trip")
    routes = plan_activity_routes()
    box_font = load_font(28)
    small_font = load_font(24)
    decision_font = load_font(26, bold=True)

    # Activities and decisions are placed entirely inside their responsible lanes.
    open_map = rounded_activity(draw, (135, 322, 780, 432), "Open /map", fill=PALE_GREEN, font=box_font)
    open_shell = rounded_activity(
        draw,
        (925, 305, 1585, 445),
        "Open map shell\nand start asynchronous GPS",
        font=box_font,
    )
    gps = rounded_activity(
        draw,
        (925, 495, 1585, 625),
        "Apply GPS location when available\n(or keep a manual map center)",
        fill=BOX_GREY,
        font=small_font,
    )
    edit_stops = rounded_activity(
        draw,
        (135, 505, 780, 640),
        "Add or edit stops",
        fill=PALE_GREEN,
        font=box_font,
    )
    submit = rounded_activity(
        draw,
        (135, 720, 780, 830),
        "Submit route request",
        fill=PALE_GREEN,
        font=box_font,
    )
    validate_points = rounded_activity(
        draw,
        (925, 720, 1585, 830),
        "Validate stop points",
        font=box_font,
    )
    valid_points = draw_decision(draw, (1255, 925), (300, 150), "Valid\npoints?", font=decision_font)
    route_mode = rounded_activity(
        draw,
        (925, 1035, 1585, 1170),
        "Select current-order route\nor optimized route",
        font=box_font,
    )
    backend_validate = rounded_activity(
        draw,
        (1765, 1035, 2515, 1170),
        "Validate route request\nand stop sequence",
        font=box_font,
    )
    request_valid = draw_decision(draw, (2140, 1265), (330, 170), "Request\nvalid?", font=decision_font)
    validation_error = rounded_activity(
        draw,
        (925, 1200, 1585, 1340),
        "Show validation error\nand return to stop editing",
        fill=PALE_RED,
        font=small_font,
    )
    osrm = rounded_activity(
        draw,
        (1765, 1400, 2515, 1535),
        "Call OSRM route or\ntrip operation",
        fill=BOX_GREY,
        font=box_font,
    )
    normalize = rounded_activity(
        draw,
        (1765, 1600, 2515, 1740),
        "Normalize order, path,\ndistance and duration",
        fill=BOX_GREY,
        font=small_font,
    )
    display_route = rounded_activity(
        draw,
        (925, 1600, 1585, 1740),
        "Display route, stop order\nand travel summary",
        font=small_font,
    )
    review = rounded_activity(
        draw,
        (135, 1780, 450, 1890),
        "Review trip",
        fill=PALE_GREEN,
        font=small_font,
    )
    optimize_optional = rounded_activity(
        draw,
        (500, 1780, 790, 1890),
        "Optional:\nOptimize Stop Order",
        fill=PALE_YELLOW,
        font=load_font(21, bold=True),
        dashed=True,
    )

    # Start marker and control-flow arrows are routed through open gutters.
    draw.ellipse((168, 266, 198, 296), fill=BLACK)
    draw_polyline_arrow(draw, [(183, 296), (183, 322)], width=STROKE)
    draw_polyline_arrow(draw, [(780, 378), (925, 378)], width=STROKE)
    draw_polyline_arrow(draw, [(1255, 445), (1255, 495)], width=STROKE)
    draw_polyline_arrow(draw, routes["gps_to_edit"], width=STROKE)
    draw_polyline_arrow(draw, [(457, 640), (457, 720)], width=STROKE)
    draw_polyline_arrow(draw, [(780, 775), (925, 775)], width=STROKE)
    draw_polyline_arrow(draw, [(1255, 830), (1255, 850)], width=STROKE)
    draw_label_on_line(draw, (1295, 990), "valid", font=load_font(22, bold=True))
    draw_polyline_arrow(draw, [(1105, 925), (875, 925), (875, 1270), (925, 1270)], width=STROKE)
    draw_label_on_line(draw, (900, 945), "invalid", font=load_font(22, bold=True))
    draw_polyline_arrow(draw, [(1255, 1000), (1255, 1035)], width=STROKE)
    draw_polyline_arrow(draw, [(1585, 1102), (1765, 1102)], width=STROKE)
    draw_polyline_arrow(draw, [(2140, 1170), (2140, 1180)], width=STROKE)
    draw_polyline_arrow(draw, routes["backend_invalid_to_error"], width=STROKE)
    draw_label_on_line(draw, (1705, 1235), "invalid", font=load_font(22, bold=True))
    draw_polyline_arrow(draw, [(2140, 1350), (2140, 1400)], width=STROKE)
    draw_label_on_line(draw, (2180, 1360), "valid", font=load_font(22, bold=True))
    draw_polyline_arrow(draw, [(2140, 1535), (2140, 1600)], width=STROKE)
    draw_polyline_arrow(draw, [(1765, 1670), (1585, 1670)], width=STROKE)
    draw_polyline_arrow(draw, routes["display_to_review"], width=STROKE)
    draw_polyline_arrow(draw, [(450, 1835), (500, 1835)], dashed=True, width=STROKE)

    # The retry loop uses the empty lower gutter and returns along the far-left margin.
    draw_polyline_arrow(
        draw,
        routes["validation_error_retry"],
        dashed=True,
        width=STROKE,
    )
    draw_label_on_line(draw, (110, 1345), "edit and retry", font=load_font(21, bold=True))

    path = OUTPUT_DIR / "map-routing-activity-plan-trip.png"
    image.save(path, format="PNG", optimize=False, compress_level=9)
    return path


def render_optimize_activity() -> Path:
    image, draw = new_canvas(
        "Map Routing — Optimize Stop Order",
        "Activity diagram • explicit optimization request, OSRM processing and return to the base use case",
    )
    draw_activity_lanes(draw, title_suffix="Optimize Stop Order")
    routes = optimize_activity_routes()
    box_font = load_font(28)
    small_font = load_font(24)
    decision_font = load_font(26, bold=True)

    request = rounded_activity(
        draw,
        (135, 322, 780, 455),
        "Explicitly request\n“Suggest Best Order”",
        fill=PALE_GREEN,
        font=box_font,
    )
    send_request = rounded_activity(
        draw,
        (925, 322, 1585, 455),
        "Send Suggest Best Order\nrequest",
        font=box_font,
    )
    validate = rounded_activity(
        draw,
        (1765, 322, 2515, 455),
        "Validate stops, current\nlocation and request mode",
        fill=BOX_GREY,
        font=small_font,
    )
    valid = draw_decision(draw, (2140, 615), (330, 170), "Request\nvalid?", font=decision_font)
    validation_failure = rounded_activity(
        draw,
        (925, 550, 1585, 690),
        "Show validation failure\nand return to stop editing",
        fill=PALE_RED,
        font=small_font,
    )
    optimize = rounded_activity(
        draw,
        (1765, 760, 2515, 900),
        "Call OSRM trip\noptimization",
        fill=BOX_GREY,
        font=box_font,
    )
    osrm_result = draw_decision(draw, (2140, 1055), (330, 170), "OSRM\nsuccess?", font=decision_font)
    processing_failure = rounded_activity(
        draw,
        (925, 985, 1585, 1125),
        "Show optimization failure\nand keep the current order",
        fill=PALE_RED,
        font=small_font,
    )
    normalized = rounded_activity(
        draw,
        (1765, 1200, 2515, 1360),
        "Map OSRM output:\norder / path / distance / duration",
        fill=BOX_GREY,
        font=small_font,
    )
    render = rounded_activity(
        draw,
        (925, 1200, 1585, 1360),
        "Render optimized stop order\nand route summary",
        font=box_font,
    )
    review = rounded_activity(
        draw,
        (135, 1450, 780, 1590),
        "Review suggested order\nand route",
        fill=PALE_GREEN,
        font=box_font,
    )
    return_base = rounded_activity(
        draw,
        (135, 1690, 780, 1830),
        "Return to\nPlan Multi-Stop Trip",
        fill=PALE_YELLOW,
        font=box_font,
    )

    draw.ellipse((168, 266, 198, 296), fill=BLACK)
    draw_polyline_arrow(draw, [(183, 296), (183, 322)], width=STROKE)
    draw_polyline_arrow(draw, [(780, 388), (925, 388)], width=STROKE)
    draw_polyline_arrow(draw, [(1585, 388), (1765, 388)], width=STROKE)
    draw_polyline_arrow(draw, [(2140, 455), (2140, 530)], width=STROKE)
    draw_polyline_arrow(draw, routes["validation_invalid_to_error"], width=STROKE)
    draw_label_on_line(draw, (1690, 585), "invalid", font=load_font(22, bold=True))
    draw_polyline_arrow(draw, [(2140, 700), (2140, 760)], width=STROKE)
    draw_label_on_line(draw, (2180, 718), "valid", font=load_font(22, bold=True))
    draw_polyline_arrow(draw, [(2140, 900), (2140, 970)], width=STROKE)
    draw_polyline_arrow(draw, routes["osrm_failure_to_error"], width=STROKE)
    draw_label_on_line(draw, (1690, 1025), "failure", font=load_font(22, bold=True))
    draw_polyline_arrow(draw, [(2140, 1140), (2140, 1200)], width=STROKE)
    draw_label_on_line(draw, (2180, 1155), "success", font=load_font(22, bold=True))
    draw_polyline_arrow(draw, [(1765, 1280), (1585, 1280)], width=STROKE)
    draw_polyline_arrow(draw, routes["render_to_review"], width=STROKE)
    draw_polyline_arrow(draw, [(455, 1590), (455, 1690)], width=STROKE)
    draw_label_on_line(draw, (490, 1620), "return", font=load_font(22, bold=True))

    # Validation uses the local gap to retry; provider failure keeps the current
    # order and returns to the base use case through the open lower gutter.
    draw_polyline_arrow(
        draw,
        routes["validation_failure_retry"],
        dashed=True,
        width=STROKE,
    )
    draw_polyline_arrow(
        draw,
        routes["processing_failure_to_return"],
        width=STROKE,
    )

    path = OUTPUT_DIR / "map-routing-activity-optimize.png"
    image.save(path, format="PNG", optimize=False, compress_level=9)
    return path


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    paths = [render_use_case(), render_plan_activity(), render_optimize_activity()]
    for path in paths:
        print(path)


if __name__ == "__main__":
    main()

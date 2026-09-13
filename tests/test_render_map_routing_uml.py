import unittest

from scripts.render_map_routing_uml import (
    ARROW_INSET,
    inset_arrow_tip,
    optimize_activity_routes,
    plan_activity_routes,
)


LANE_DIVIDERS = {850, 1660}


def vertical_segments(points):
    return [
        (start, end)
        for start, end in zip(points, points[1:])
        if start[0] == end[0]
    ]


class ActivityRouteLayoutTests(unittest.TestCase):
    def test_plan_cross_lane_connectors_do_not_have_micro_jogs(self):
        routes = plan_activity_routes()

        self.assertEqual(routes["gps_to_edit"], [(925, 572), (780, 572)])
        self.assertEqual(
            routes["backend_invalid_to_error"],
            [(1975, 1265), (1585, 1265)],
        )

    def test_plan_review_flow_targets_the_actual_review_box_center(self):
        route = plan_activity_routes()["display_to_review"]

        self.assertEqual(route[-1], (292, 1765))
        self.assertTrue(
            all(start[0] not in LANE_DIVIDERS for start, _ in vertical_segments(route))
        )

    def test_plan_retry_loop_uses_a_clear_lower_gutter(self):
        route = plan_activity_routes()["validation_error_retry"]

        self.assertEqual(route[0], (1255, 1340))
        self.assertEqual(route[-1], (135, 572))
        self.assertIn((1255, 1380), route)
        self.assertIn((115, 1380), route)
        self.assertIn((115, 572), route)

    def test_optimize_review_flow_enters_box_from_top_center(self):
        route = optimize_activity_routes()["render_to_review"]

        self.assertEqual(route[-1], (457, 1450))
        self.assertTrue(
            all(start[0] not in LANE_DIVIDERS for start, _ in vertical_segments(route))
        )

    def test_optimize_error_connectors_do_not_have_micro_jogs(self):
        routes = optimize_activity_routes()

        self.assertEqual(
            routes["validation_invalid_to_error"],
            [(1975, 615), (1585, 615)],
        )
        self.assertEqual(
            routes["osrm_failure_to_error"],
            [(1975, 1055), (1585, 1055)],
        )

    def test_optimize_validation_retry_uses_the_local_gap(self):
        routes = optimize_activity_routes()
        validation = routes["validation_failure_retry"]

        self.assertEqual(validation[0], (925, 620))
        self.assertEqual(validation[-1], (457, 460))
        self.assertIn((820, 480), validation)

    def test_optimize_processing_failure_returns_without_crossing_success_flow(self):
        route = optimize_activity_routes()["processing_failure_to_return"]

        self.assertEqual(route[0], (1255, 1125))
        self.assertEqual(route[-1], (135, 1760))
        self.assertIn((1255, 1160), route)
        self.assertIn((95, 1160), route)
        self.assertIn((95, 1760), route)
        self.assertTrue(
            all(start[0] not in LANE_DIVIDERS for start, _ in vertical_segments(route))
        )

    def test_arrow_tip_is_advanced_one_full_head_inside_the_target(self):
        route = [(100, 100), (200, 100)]

        self.assertEqual(
            inset_arrow_tip(route, ARROW_INSET),
            [(100, 100), (200 + ARROW_INSET, 100)],
        )

    def test_arrow_tip_inset_preserves_the_final_segment_direction(self):
        route = [(100, 200), (100, 100)]

        self.assertEqual(
            inset_arrow_tip(route, ARROW_INSET),
            [(100, 200), (100, 100 - ARROW_INSET)],
        )


if __name__ == "__main__":
    unittest.main()

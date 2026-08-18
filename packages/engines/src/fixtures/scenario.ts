import { createObjectGraph, type ObjectGraph } from '../e1-object-graph'
import type { Actor, Edge, ObjectRef } from '../types'

/** Kịch bản dữ liệu đóng băng.
 *
 *  docs/kien-truc-san-pham.md: "Có đúng **hai kịch bản**, không thêm kịch bản thứ ba" và
 *  "**Không trộn hai kịch bản trên cùng một màn**".
 *
 *  Luật đó được giữ ở ba tầng:
 *   1 · mỗi kịch bản là một `ObjectGraph` riêng — trộn phải cầm hai graph, nhìn thấy ngay khi review;
 *   2 · rule lint `aurora/no-scenario-mix` chặn một file màn import từ hai kịch bản;
 *   3 · test `scenario.test.ts` khoá mọi con số đã chốt, đổi một số là đỏ CI. */
export type ScenarioId = 'sao-do' | 'das-vina'

export type Scenario = {
  id: ScenarioId
  name: string
  /** Lát cắt thời gian đóng băng. Mọi số trên màn tính tại đúng thời điểm này. */
  frozenAt: string
  objects: ObjectRef[]
  edges: Edge[]
  actors: Actor[]
}

export type LoadedScenario = Scenario & { graph: ObjectGraph }

export function loadScenario(s: Scenario): LoadedScenario {
  return { ...s, graph: createObjectGraph(s.objects, s.edges) }
}

/* tslint:disable */
/* eslint-disable */

export class QuizEngine {
    free(): void;
    [Symbol.dispose](): void;
    advance(): void;
    back(): boolean;
    /**
     * 组卷，返回题数。filter_json 非法时返回 0。
     */
    build(filter_json: string): number;
    /**
     * 分类元数据，按声明顺序 —— 筛选面板据此渲染 chips
     */
    cats(): any;
    /**
     * 筛选面板的实时计数
     */
    count(filter_json: string): any;
    current(): any;
    /**
     * 题库自检：字符串数组，空数组表示无问题
     */
    health(): any;
    is_dirty(): boolean;
    is_finished(): boolean;
    judge(picked: Uint32Array): any;
    /**
     * 导入状态（设置面板的「导入进度」）。校验失败返回 Err，不动现有状态。
     */
    load_state_json(json: string): void;
    mark_clean(): void;
    constructor(questions_json: string, categories_json: string, state_json?: string | null);
    oral(): boolean;
    oral_seconds(): number;
    position(): number;
    questions_json(): string;
    /**
     * grade: "know" | "fuzzy" | "no"。未知值或已完成时静默忽略。
     */
    record(grade: string): void;
    /**
     * 恢复上次未刷完的卷
     */
    restore_deck(): boolean;
    set_oral(v: boolean): void;
    set_oral_seconds(v: number): void;
    set_theme(v: string): void;
    size(): number;
    /**
     * 导出状态给 TS 落盘
     */
    state_json(): string;
    stats(): any;
    theme(): string;
    toggle_fav(): boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_quizengine_free: (a: number, b: number) => void;
    readonly quizengine_advance: (a: number) => void;
    readonly quizengine_back: (a: number) => number;
    readonly quizengine_build: (a: number, b: number, c: number) => number;
    readonly quizengine_cats: (a: number) => [number, number, number];
    readonly quizengine_count: (a: number, b: number, c: number) => [number, number, number];
    readonly quizengine_current: (a: number) => [number, number, number];
    readonly quizengine_health: (a: number) => [number, number, number];
    readonly quizengine_is_dirty: (a: number) => number;
    readonly quizengine_is_finished: (a: number) => number;
    readonly quizengine_judge: (a: number, b: number, c: number) => [number, number, number];
    readonly quizengine_load_state_json: (a: number, b: number, c: number) => [number, number];
    readonly quizengine_mark_clean: (a: number) => void;
    readonly quizengine_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly quizengine_oral: (a: number) => number;
    readonly quizengine_oral_seconds: (a: number) => number;
    readonly quizengine_position: (a: number) => number;
    readonly quizengine_questions_json: (a: number) => [number, number];
    readonly quizengine_record: (a: number, b: number, c: number) => void;
    readonly quizengine_restore_deck: (a: number) => number;
    readonly quizengine_set_oral: (a: number, b: number) => void;
    readonly quizengine_set_oral_seconds: (a: number, b: number) => void;
    readonly quizengine_set_theme: (a: number, b: number, c: number) => void;
    readonly quizengine_size: (a: number) => number;
    readonly quizengine_state_json: (a: number) => [number, number];
    readonly quizengine_stats: (a: number) => [number, number, number];
    readonly quizengine_theme: (a: number) => [number, number];
    readonly quizengine_toggle_fav: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

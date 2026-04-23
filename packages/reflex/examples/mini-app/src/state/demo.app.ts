import {
  batch,
  computed,
  createModel,
  effect,
  event,
  filter,
  flush,
  hold,
  isModel,
  map,
  memo,
  merge,
  own,
  scan,
  signal,
  subscribeOnce,
  withEffectCleanupRegistrar,
} from "@volynets/reflex";
import {
  createKeyedProjection,
  createProjection,
  createSelector,
  createStoreProjection,
  isPending,
  optimistic,
  resource,
  transition,
} from "@volynets/reflex/unstable";
import {
  createInsight,
  demoTasks,
  type DemoInsight,
  type DemoRiskLevel,
  type DemoTask,
  type DemoTaskStatus,
  wait,
} from "./demo.data";

type DemoFilterMode = "all" | "focus" | "done";
type ActivityKind = "command" | "effect" | "resource" | "save";
type ActivityTone = "info" | "success" | "warn" | "quiet";

interface ActivityDraft {
  kind: ActivityKind;
  label: string;
  detail: string;
  tone: ActivityTone;
}

export interface ActivityEntry extends ActivityDraft {
  id: number;
  timestamp: string;
}

interface WorkspaceStore {
  title: string;
  subtitle: string;
  selectedSummary: string;
  queueHint: string;
}

interface MetricsStore {
  totals: {
    visible: number;
    open: number;
    throughput: number;
  };
  selection: {
    id: string;
    owner: string;
    status: DemoTaskStatus | "none";
  };
}

interface InsightRequest {
  id: string;
  title: string;
  owner: string;
  status: DemoTaskStatus;
  points: number;
  summary: string;
  risk: DemoRiskLevel;
  tags: readonly string[];
  query: string;
}

interface HeartbeatResource {
  readonly disposed: boolean;
  [Symbol.dispose](): void;
}

function createHeartbeat(setBeat: Setter<number>): HeartbeatResource {
  let disposed = false;
  const timer = window.setInterval(() => {
    if (disposed) return;
    setBeat((value) => value + 1);
  }, 2400);

  return {
    get disposed() {
      return disposed;
    },
    [Symbol.dispose]() {
      if (disposed) return;
      disposed = true;
      window.clearInterval(timer);
    },
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createActivity(id: number, draft: ActivityDraft): ActivityEntry {
  return {
    ...draft,
    id,
    timestamp: formatTime(new Date()),
  };
}

function matchesFilter(task: DemoTask, mode: DemoFilterMode, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  const queryMatch =
    normalizedQuery === "" ||
    task.title.toLowerCase().includes(normalizedQuery) ||
    task.owner.toLowerCase().includes(normalizedQuery) ||
    task.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

  if (!queryMatch) return false;
  if (mode === "all") return true;
  if (mode === "done") return task.status === "done";
  return task.status === "active" || task.status === "review";
}

function cycleStatus(status: DemoTaskStatus): DemoTaskStatus {
  switch (status) {
    case "planned":
      return "active";
    case "active":
      return "review";
    case "review":
      return "done";
    default:
      return "planned";
  }
}

const createOwnershipModel = createModel((ctx) => {
  const [beat, setBeat] = signal(0);
  own(ctx, createHeartbeat(setBeat) as { [Symbol.dispose](): void });

  const badge = memo(() => `Owned heartbeat / ${beat()} ticks`);

  return {
    badge,
    beat,
    ping: ctx.action(() => {
      setBeat((value) => value + 1);
    }),
  };
});

export function createDemoApp() {
  const cleanups: Destructor[] = [];
  const registerCleanup = (cleanup: Destructor) => {
    cleanups.push(cleanup);
  };

  const ownership = createOwnershipModel();
  const ownershipModelFlag = isModel(ownership);
  registerCleanup(() => {
    ownership[Symbol.dispose]!();
  });

  const [tasks, setTasks] = signal([...demoTasks]);
  const [selectedId, setSelectedId] = signal(demoTasks[0]?.id ?? "");
  const [filterMode, setFilterMode] = signal<DemoFilterMode>("all");
  const [searchQuery, setSearchQuery] = signal("");
  const [editorValue, setEditorValue] = signal(demoTasks[0]?.title ?? "");
  const [flushCount, setFlushCount] = signal(0);
  const [firstSystemTrace, setFirstSystemTrace] = signal(
    "Waiting for the first scheduled trace.",
  );
  const [saveState, setSaveState] = signal<"idle" | "saving" | "settled">(
    "idle",
  );

  const commandBus = event<ActivityDraft>();
  const systemBus = event<ActivityDraft>();

  const commandLabels = map(
    filter(commandBus, (entry) => entry.tone !== "quiet"),
    (entry) => `${entry.kind.toUpperCase()} / ${entry.label}`,
  );
  const systemLabels = map(systemBus, (entry) => `SCHEDULER / ${entry.label}`);
  const mergedLabels = merge(commandLabels, systemLabels);
  const mergedEvents = merge(commandBus, systemBus);

  const [latestLabel, disposeLatestLabel] = hold(
    mergedLabels,
    "Session booted.",
  );
  const [activityCount, disposeActivityCount] = scan(
    commandBus,
    0,
    (count) => count + 1,
  );
  let nextActivityId = 1;
  const [activityFeed, disposeActivityFeed] = scan(
    mergedEvents,
    [] as ActivityEntry[],
    (feed, draft) =>
      [createActivity(nextActivityId++, draft), ...feed].slice(0, 18),
  );
  const stopSystemProbe = subscribeOnce(systemLabels, (label) => {
    setFirstSystemTrace(label);
  });

  registerCleanup(disposeLatestLabel);
  registerCleanup(disposeActivityCount);
  registerCleanup(disposeActivityFeed);
  registerCleanup(stopSystemProbe);

  const selectedTask = computed(() =>
    tasks().find((task) => task.id === selectedId()),
  );
  const visibleTasks = computed(() =>
    tasks().filter((task) => matchesFilter(task, filterMode(), searchQuery())),
  );
  const openTasks = computed(
    () => tasks().filter((task) => task.status !== "done").length,
  );
  const completedPoints = computed(() =>
    tasks()
      .filter((task) => task.status === "done")
      .reduce((total, task) => total + task.points, 0),
  );
  const warmedThroughput = memo(() => {
    const totalTasks = tasks().length || 1;
    return Number((completedPoints() / totalTasks).toFixed(1));
  });
  const pendingFlushNotice = computed(
    () =>
      `Direct reads are live. Effects and resources settle when you flush. Cycle #${flushCount()}.`,
  );

  const reactiveTools = withEffectCleanupRegistrar(registerCleanup, () => {
    const selectionState = createSelector(selectedId);
    const spotlightSource = computed(
      () =>
        selectedTask() ?? {
          id: "__none__",
          title: "Choose a task",
          owner: "Nobody",
          status: "planned" as DemoTaskStatus,
          points: 0,
          summary: "Select a row to inspect scoped updates.",
          risk: "low" as DemoRiskLevel,
          tags: [] as readonly string[],
        },
    );
    const spotlightTitleById = createKeyedProjection(
      spotlightSource,
      (task) => task.id,
      (task) => task.title,
      { fallback: "" },
    );
    const spotlightMetaById = createProjection(
      spotlightSource,
      (task) => task.id,
      (task) => `${task.owner} / ${task.status} / ${task.points} pts`,
      { fallback: "" },
    );
    const workspace = createProjection<WorkspaceStore>(
      (draft) => {
        const current = selectedTask();
        draft.title = "Reflex Operations Deck";
        draft.subtitle = latestLabel();
        draft.selectedSummary = current
          ? `${current.id} is owned by ${current.owner} with ${current.risk} risk.`
          : "Nothing is selected yet.";
        draft.queueHint = pendingFlushNotice();
      },
      {
        title: "Reflex Operations Deck",
        subtitle: "Session booted.",
        selectedSummary: "Nothing is selected yet.",
        queueHint: "",
      },
    );
    const metrics = createStoreProjection<MetricsStore>(
      () => {
        const current = selectedTask();
        return {
          totals: {
            visible: visibleTasks().length,
            open: openTasks(),
            throughput: warmedThroughput(),
          },
          selection: {
            id: current?.id ?? "none",
            owner: current?.owner ?? "n/a",
            status: current?.status ?? "none",
          },
        };
      },
      {
        totals: { visible: 0, open: 0, throughput: 0 },
        selection: { id: "none", owner: "n/a", status: "none" },
      },
    );
    const insightRequest = computed<InsightRequest | null>(() => {
      const current = selectedTask();

      if (!current) {
        return null;
      }

      return {
        id: current.id,
        title: current.title,
        owner: current.owner,
        status: current.status,
        points: current.points,
        summary: current.summary,
        risk: current.risk,
        tags: current.tags,
        query: searchQuery().trim(),
      };
    });
    const insights = resource<InsightRequest | null, DemoInsight>(
      insightRequest,
      async (request) => {
        if (request === null) {
          throw new Error("Select a task to inspect asynchronous insights.");
        }

        const latencyMs =
          520 + ((request.id.length + request.query.length) % 5) * 140;
        await wait(latencyMs);

        return createInsight(
          {
            id: request.id,
            title: request.title,
            owner: request.owner,
            status: request.status,
            points: request.points,
            summary: request.summary,
            risk: request.risk,
            tags: request.tags,
          },
          request.query,
          latencyMs,
        );
      },
    );
    const [optimisticTitle, setOptimisticTitle] = optimistic(
      () => selectedTask()?.title ?? "Choose a task",
      "Choose a task",
    );

    return {
      insights,
      isPendingInsights: () => isPending(insights),
      metrics,
      optimisticTitle,
      selectionState,
      setOptimisticTitle,
      spotlightMetaById,
      spotlightTitleById,
      workspace,
    };
  });

  registerCleanup(
    effect(() => {
      const current = selectedTask();
      const status = reactiveTools.insights.status();
      const resourceLabel = current ? `${current.id} / ${status}` : "none / idle";

      systemBus.emit({
        kind: "effect",
        label: `Queued trace settled for ${resourceLabel}`,
        detail: `Owned heartbeat ${ownership.beat()} reached flush cycle ${flushCount()}.`,
        tone: "quiet",
      });
    }),
  );

  function logCommand(entry: ActivityDraft): void {
    commandBus.emit(entry);
  }

  function selectTask(id: string): void {
    const next = tasks().find((task) => task.id === id);
    setSelectedId(id);
    setEditorValue(next?.title ?? "");

    logCommand({
      kind: "command",
      label: `Selected ${id}`,
      detail: "Keyed selector updates only the previous and next row.",
      tone: "info",
    });
  }

  function setFilter(mode: DemoFilterMode): void {
    setFilterMode(mode);
    logCommand({
      kind: "command",
      label: `Filter switched to ${mode}`,
      detail: "Visible rows are derived with computed accessors.",
      tone: "info",
    });
  }

  function updateSearch(value: string): void {
    setSearchQuery(value);
    logCommand({
      kind: "command",
      label: `Search changed to ${value || "empty"}`,
      detail: "The async resource will refetch on the next flush.",
      tone: "quiet",
    });
  }

  function cycleSelectedStatus(): void {
    const current = selectedTask();
    if (!current) return;

    const nextStatus = cycleStatus(current.status);
    setTasks((entries) =>
      entries.map((task) =>
        task.id === current.id ? { ...task, status: nextStatus } : task,
      ),
    );

    logCommand({
      kind: "command",
      label: `Moved ${current.id} to ${nextStatus}`,
      detail: "Signals mutated synchronously; effects remain queued.",
      tone: "info",
    });
  }

  function runBatchScenario(): void {
    batch(() => {
      setFilterMode("focus");
      setSearchQuery("sync");
      setTasks((entries) =>
        entries.map((task, index) =>
          index === 0
            ? {
                ...task,
                status: "review",
                points: task.points + 1,
              }
            : task,
        ),
      );

      logCommand({
        kind: "command",
        label: "Batched a scenario update",
        detail: "Multiple writes landed inside one explicit batch.",
        tone: "success",
      });
    });
  }

  function requestInsightRefresh(): void {
    reactiveTools.insights.refetch();

    logCommand({
      kind: "resource",
      label: "Queued a resource refetch",
      detail: "The request token advances when the scheduler flushes.",
      tone: "info",
    });
  }

  function flushScheduler(): void {
    setFlushCount((count) => count + 1);
    flush();

    systemBus.emit({
      kind: "effect",
      label: "Flushed queued effects and resources",
      detail: "This is the explicit scheduler boundary of the demo.",
      tone: "success",
    });
  }

  function saveSelectedTitle(): Promise<void> {
    const current = selectedTask();
    if (!current) {
      return Promise.resolve();
    }

    const nextTitle = editorValue().trim() || current.title;
    setSaveState("saving");

    logCommand({
      kind: "save",
      label: `Started transition for ${current.id}`,
      detail: "Optimistic overlay is now visible on top of the selected task title.",
      tone: "success",
    });

    return Promise.resolve(
      transition(async () => {
        reactiveTools.setOptimisticTitle(nextTitle);
        await wait(900);

        setTasks((entries) =>
          entries.map((task) =>
            task.id === current.id
              ? {
                  ...task,
                  title: nextTitle,
                  summary: `Saved from the optimistic editor at ${formatTime(new Date())}.`,
                }
              : task,
          ),
        );

        setSaveState("settled");
        logCommand({
          kind: "save",
          label: `Committed ${current.id}`,
          detail: "Server state caught up and the optimistic overlay can clear.",
          tone: "success",
        });

        await Promise.resolve();
        setSaveState("idle");
      }),
    );
  }

  return {
    activityCount,
    activityFeed,
    editorValue,
    filterMode,
    firstSystemTrace,
    flushCount,
    heartbeat: ownership.beat,
    insightResource: reactiveTools.insights,
    isModelInstance: ownershipModelFlag,
    isPendingInsights: reactiveTools.isPendingInsights,
    isSelected: reactiveTools.selectionState,
    latestLabel,
    metrics: reactiveTools.metrics,
    optimisticTitle: reactiveTools.optimisticTitle,
    saveState,
    searchQuery,
    selectedTask,
    spotlightMetaById: reactiveTools.spotlightMetaById,
    spotlightTitleById: reactiveTools.spotlightTitleById,
    tasks: visibleTasks,
    workspace: reactiveTools.workspace,
    cycleSelectedStatus,
    destroy() {
      for (let i = cleanups.length - 1; i >= 0; i -= 1) {
        cleanups[i]?.();
      }
    },
    flushScheduler,
    pingOwnership: ownership.ping,
    requestInsightRefresh,
    runBatchScenario,
    saveSelectedTitle,
    selectTask,
    setEditorValue,
    setFilterMode: setFilter,
    setSearchQuery: updateSearch,
  };
}

export type DemoModel = ReturnType<typeof createDemoApp>;

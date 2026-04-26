import {
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  Clock3,
  KanbanSquareDashed,
  LibraryBig,
  MoveRight,
  Radar,
  Sparkles,
  Waypoints,
  Workflow,
} from "lucide-react";

import { StatCard } from "../components/stat-card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  aiAutomationLoops,
  aiDecisionNotes,
  aiExperimentLog,
  aiFocusBoard,
  aiKnowledgePillars,
  aiLaunchpad,
  aiOverviewStats,
  aiSignals,
  aiSprintTracks,
} from "../data/mock";
import { cn } from "../lib/utils";

export function AiCommandCenterPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {aiOverviewStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.14fr_0.86fr]">
        <Card className="relative overflow-hidden border-none bg-[#0f2c31] text-white animate-rise">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(203,245,241,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,245,220,0.14),transparent_26%)]" />
          <div className="pointer-events-none absolute right-[-120px] top-[-110px] h-72 w-72 rounded-full bg-[rgba(145,220,212,0.18)] blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-160px] left-[-100px] h-80 w-80 rounded-full bg-[rgba(252,225,178,0.12)] blur-3xl" />
          <CardContent className="relative p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-2xl">
                <Badge className="bg-white/12 text-white/84">{aiLaunchpad.badge}</Badge>
                <div className="mt-5 flex items-center gap-3 text-white/68">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm">一个界面同时处理运营、决策和沉淀</span>
                </div>
                <h3 className="mt-4 max-w-3xl text-[2.4rem] font-semibold leading-[1.05] tracking-tight sm:text-[3rem]">
                  {aiLaunchpad.title}
                </h3>
                <p className="mt-5 max-w-2xl text-[15px] leading-7 text-white/74">{aiLaunchpad.description}</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Button className="bg-white text-[#0f2c31] hover:bg-[#f5f1e8]">
                    {aiLaunchpad.primaryAction}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/16 bg-white/5 text-white hover:border-white/24 hover:bg-white/10 hover:text-white"
                  >
                    {aiLaunchpad.secondaryAction}
                  </Button>
                </div>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-[360px] xl:grid-cols-1">
                <LaunchPanel
                  icon={Bot}
                  title="自动化副驾"
                  value="94.2%"
                  detail="本周在线流程的健康执行率保持稳定。"
                />
                <LaunchPanel
                  icon={KanbanSquareDashed}
                  title="看板焦点"
                  value="9 张卡"
                  detail="这些任务需要尽快完成负责人交接，避免进入阻塞。"
                />
                <LaunchPanel
                  icon={LibraryBig}
                  title="知识调用"
                  value="36 次"
                  detail="今天打开次数最高的是升级应答工具包。"
                />
              </div>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {aiLaunchpad.briefs.map((brief, index) => (
                <article
                  key={brief.label}
                  className={cn(
                    "rounded-[26px] border border-white/10 bg-white/6 p-4 backdrop-blur-sm",
                    index === 1 && "lg:translate-y-4",
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/56">{brief.label}</p>
                  <p className="mt-3 text-sm leading-6 text-white/76">{brief.value}</p>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="animate-rise-delayed">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-[1.18rem]">自动化循环</CardTitle>
                  <CardDescription>查看更新时间、负责人，以及当前是否需要人工介入。</CardDescription>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <Workflow className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiAutomationLoops.map((loop) => (
                <article key={loop.name} className="rounded-[24px] border border-[color:var(--border-soft)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--app-text)]">{loop.name}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">{loop.cadence}</p>
                    </div>
                    <Badge variant={statusVariant(loop.state)}>{loop.state}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{loop.detail}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--eyebrow-text)]">
                    {loop.owner}
                  </p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="animate-rise-delayed-more">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-[1.18rem]">今日焦点</CardTitle>
                  <CardDescription>这一小撮任务最影响当前产能，值得优先处理。</CardDescription>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-soft)] text-[var(--accent-strong)]">
                  <Waypoints className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiFocusBoard.map((item) => (
                <article key={item.title} className="rounded-[24px] border border-[color:var(--border-soft)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[color:var(--app-text)]">{item.title}</p>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--eyebrow-text)]">
                      {item.owner}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{item.detail}</p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-[color:var(--app-text)]">
                    <Clock3 className="h-3.5 w-3.5" />
                    {item.eta}
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.16fr_0.84fr]">
        <Card className="animate-rise">
          <CardHeader className="border-b border-[color:var(--border-soft)] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-[1.4rem]">执行看板</CardTitle>
                <CardDescription className="mt-2 text-[15px] leading-6">
                  从规划到上线的工作全程可见，每张卡都带着负责人、优先级和主题。
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline">筛选负责人</Button>
                <Button>新建卡片</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-[980px] gap-4 xl:min-w-0 xl:grid-cols-4">
                {aiSprintTracks.map((track) => (
                  <section
                    key={track.lane}
                    className={cn(
                      "rounded-[28px] border bg-[var(--surface-muted)] p-4",
                      laneToneClasses(track.tone),
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-soft)] pb-4">
                      <div>
                        <p className="font-semibold text-[color:var(--app-text)]">{track.lane}</p>
                        <p className="mt-1 text-sm text-[color:var(--muted)]">本泳道共 {track.count} 张卡</p>
                      </div>
                      <Badge variant={laneVariant(track.tone)}>{track.count}</Badge>
                    </div>

                    <div className="mt-4 space-y-3">
                      {track.items.map((item) => (
                        <article key={`${track.lane}-${item.title}`} className="rounded-[24px] border border-[color:var(--border)] bg-[var(--surface)] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[color:var(--app-text)]">{item.title}</p>
                              <p className="mt-1 text-sm text-[color:var(--muted)]">{item.owner}</p>
                            </div>
                            <Badge variant={scoreVariant(item.score)}>{item.score}</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[color:var(--app-text)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[color:var(--muted)]">
                            <span>{item.eta}</span>
                            <span className="inline-flex items-center gap-1.5 font-medium text-[color:var(--app-text)]">
                              打开
                              <MoveRight className="h-4 w-4" />
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="animate-rise-delayed">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-[1.18rem]">信号雷达</CardTitle>
                  <CardDescription>用最短的摘要帮助你判断现在先盯什么。</CardDescription>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <Radar className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiSignals.map((signal) => (
                <article key={signal.title} className="rounded-[24px] border border-[color:var(--border-soft)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[color:var(--app-text)]">{signal.title}</p>
                    <span className="text-xl font-semibold text-[color:var(--accent-strong)]">{signal.value}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{signal.note}</p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="animate-rise-delayed-more">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-[1.18rem]">决策便签</CardTitle>
                  <CardDescription>这些判断会直接影响本周看板如何推进。</CardDescription>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-soft)] text-[var(--accent-strong)]">
                  <BrainCircuit className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiDecisionNotes.map((note) => (
                <article key={note.title} className="rounded-[24px] border border-[color:var(--border-soft)] bg-[var(--surface-muted)] p-4">
                  <Badge variant="info">{note.badge}</Badge>
                  <p className="mt-3 font-semibold text-[color:var(--app-text)]">{note.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{note.summary}</p>
                </article>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="animate-rise">
          <CardHeader className="border-b border-[color:var(--border-soft)] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-[1.4rem]">智库</CardTitle>
                <CardDescription className="mt-2 text-[15px] leading-6">
                  把作战手册、提示词系统和决策参考摆在眼前，真正影响执行而不只是存档。
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline">
                  <BookOpen className="h-4 w-4" />
                  打开索引
                </Button>
                <Button>
                  <LibraryBig className="h-4 w-4" />
                  新增知识
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 pt-6 lg:grid-cols-3">
            {aiKnowledgePillars.map((pillar) => (
              <article
                key={pillar.title}
                className="rounded-[28px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,250,249,0.96))] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                    <NotebookIcon title={pillar.title} />
                  </div>
                  <Badge variant="default">{pillar.freshness}</Badge>
                </div>
                <p className="mt-5 text-lg font-semibold text-[color:var(--app-text)]">{pillar.title}</p>
                <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{pillar.summary}</p>
                <div className="mt-5 space-y-2">
                  {pillar.items.map((item) => (
                    <div
                      key={`${pillar.title}-${item}`}
                      className="rounded-2xl bg-[var(--surface-muted)] px-3.5 py-3 text-sm font-medium text-[color:var(--app-text)]"
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--eyebrow-text)]">
                  {pillar.owner}
                </p>
              </article>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="animate-rise-delayed">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-[1.18rem]">实验记录</CardTitle>
                  <CardDescription>短读版结果：哪些在赢，哪些还吵，哪些值得回看。</CardDescription>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <Bot className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiExperimentLog.map((item) => (
                <article key={item.name} className="rounded-[24px] border border-[color:var(--border-soft)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[color:var(--app-text)]">{item.name}</p>
                    <Badge variant={scoreVariant(item.result)}>{item.result}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{item.note}</p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-none bg-[linear-gradient(180deg,#153d43,#102f34)] text-white animate-rise-delayed-more">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-white/64">知识到动作回路</p>
                  <h3 className="mt-2 text-[1.9rem] font-semibold">少看废话，直接落地</h3>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/82">
                  <Sparkles className="h-6 w-6" />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/74">
                智库的意义不是堆资料，而是在工作还在流动时，让下一次判断、提示词和交接都更准。
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function LaunchPanel({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof Bot;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/66">{title}</p>
          <p className="mt-2 text-[1.6rem] font-semibold text-white">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/80">
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/72">{detail}</p>
    </article>
  );
}

function NotebookIcon({ title }: { title: string }) {
  if (title === "发布手册") {
    return <BookOpen className="h-5 w-5" />;
  }

  if (title === "提示词系统") {
    return <BrainCircuit className="h-5 w-5" />;
  }

  return <Radar className="h-5 w-5" />;
}

function statusVariant(state: string): "success" | "warning" | "danger" {
  if (state === "正常") {
    return "success";
  }

  if (state === "关注中") {
    return "warning";
  }

  return "danger";
}

function laneVariant(tone: string): "default" | "info" | "warning" | "success" {
  if (tone === "info") {
    return "info";
  }

  if (tone === "warning") {
    return "warning";
  }

  if (tone === "success") {
    return "success";
  }

  return "default";
}

function laneToneClasses(tone: string) {
  if (tone === "info") {
    return "border-[#d9ebee]";
  }

  if (tone === "warning") {
    return "border-[#f2e1b4]";
  }

  if (tone === "success") {
    return "border-[#d6eadc]";
  }

  return "border-[color:var(--border)]";
}

function scoreVariant(score: string): "default" | "info" | "warning" | "success" {
  if (score === "紧急") {
    return "info";
  }

  if (score === "风险" || score === "观察中") {
    return "warning";
  }

  if (score === "可上线" || score.startsWith("提升")) {
    return "success";
  }

  return "default";
}

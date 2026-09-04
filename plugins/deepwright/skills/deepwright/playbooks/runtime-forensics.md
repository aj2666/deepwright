### Runtime forensics

**You own the diagnosis. Instrument the live process, don't theorize from source.** For "why is X leaking / spinning / slow at runtime", heap snapshots, idle-but-busy processes, intermittent glitches. The deliverable is a cited diagnosis, not a fix.

1. Capture the live signal with an available browser, debugger, terminal, simulator, or application-control capability: a CPU profile for a spinning process, a heap snapshot for a leak, or a trace for a visual glitch. Produce a real artifact, not a guess. If the host cannot reach the process, state the limitation.
2. Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a GC root, or the loop firing without input. When collaboration tools are available, parse large artifacts in a read-only subagent; otherwise parse them in bounded chunks. Keep only the reduced finding in the main thread.
3. Prove the mechanism before believing it. Add reversible instrumentation through the debugger or a scoped local test edit, then observe the running process. Use only disposable or explicitly authorized targets, and remove the instrumentation before reporting. Do not mutate production systems or externally hosted code. A plausible-but-unconfirmed cause can be wrong while the real one sits one layer over.
4. Map the finding back to source: file, symbol, the line that allocates or schedules.
5. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only forensics`.

**Reply:** the signal captured, the reduced finding, how you proved the mechanism, the source location, artifact paths. No fix unless asked; hand back to Bug fix or Perf once the cause is known.

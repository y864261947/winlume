# WinLume Workbench

WinLume is a general AI workbench where conversations direct work and durable Artifacts carry professional results across reusable workflows.

## Language

**Work Scene**:
A discovery lens that groups relevant capabilities around a user goal without changing the workbench into a domain-specific product.
_Avoid_: Vertical dashboard, workflow

**Workflow Pack**:
A versioned professional production path with declared intake, ordered Stages, expected Artifacts, quality checks, and approval policy.
_Avoid_: Skill bundle, template, scenario

**Skill**:
A reusable instruction and quality contract applied to a Stage or an ordinary conversation.
_Avoid_: Workflow, agent

**Tool**:
A focused capability that creates, inspects, or transforms work inside WinLume.
_Avoid_: Connector, Skill

**Connector**:
An integration that crosses into an external data source or side-effecting system.
_Avoid_: Tool, App

**Artifact**:
A durable, inspectable work product that can be reviewed, edited, referenced, handed off, exported, or delivered.
_Avoid_: Message, response

**Intake**:
The validated facts, constraints, source material, and assumptions supplied before a Workflow Pack begins execution.
_Avoid_: Prompt, configuration

**Stage**:
One ordered unit of production within a Workflow Pack, ending in declared Artifact outputs or a review decision.
_Avoid_: Step, task

**Handoff**:
The transfer of canonical Artifact references and a bounded summary from one Stage to the next.
_Avoid_: Transcript, context dump

**Run**:
A durable record of one actual Stage execution or revision, including its recovery and cancellation state. A Workflow Pack may produce a chain of Runs.
_Avoid_: Launch, Session

**Review**:
A structured assessment of Stage outputs against declared criteria, with evidence and required corrections.
_Avoid_: Feedback, status

**Approval**:
An explicit decision that allows reviewed work to advance or be treated as delivery-ready.
_Avoid_: Completion, publish

# Agent skills

Two skills that teach an AI coding assistant how to work with Laylo: how to
set up and verify credentials, and how to answer questions about an account's
drops, fans, and conversions. Each is a folder with a `SKILL.md`, in the
[Agent Skills](https://agentskills.io) format that Claude, Codex, and other
assistants read.

Pick the one that matches how you call Laylo:

- [`laylo-node`](./laylo-node) uses this SDK, `@laylo.com/node`. Use it in
  JavaScript and TypeScript projects.
- [`laylo-api`](./laylo-api) calls the HTTP API directly with curl or any
  language's HTTP client. Use it everywhere else, or when you can't add a
  dependency.

Installing both is fine. The descriptions steer the assistant to the right one.

## Install

The easiest way is as a plugin: this repo is a plugin marketplace for Claude
Code, Codex, and Cursor, and installing the `laylo` plugin gets you both
skills. See [Using an AI assistant](../README.md#using-an-ai-assistant) for
the commands.

To install a single skill by hand instead, download the folder you want (or
clone this repo), then:

**Claude Code.** Copy the folder into `~/.claude/skills/` to use it in every
project, or into `.claude/skills/` inside one project:

```sh
cp -r skills/laylo-node ~/.claude/skills/
```

**Claude desktop and claude.ai.** Download
[`laylo-node.zip`](./laylo-node.zip) or [`laylo-api.zip`](./laylo-api.zip)
and upload it under **Settings → Capabilities → Skills**. To build the zip
yourself after editing a skill, keep `SKILL.md` inside the skill's folder:

```sh
cd skills && zip -rX laylo-node.zip laylo-node -x '*.DS_Store'
```

**Codex.** Copy the folder into `~/.agents/skills/`, or into `.agents/skills/`
inside a repository, then restart Codex:

```sh
cp -r skills/laylo-api ~/.agents/skills/
```

**Other assistants.** Any tool that reads Agent Skills can use these folders
as-is. For one that doesn't, paste the contents of `SKILL.md` into its custom
instructions and attach the file under `references/` as extra context.

## Try it

Ask something like:

- "Help me set up Laylo credentials for this project."
- "How many SMS subscribers do we have in the US?"
- "Which of our drops are live right now?"
- "How many ticket purchases did we track last week?"

The skills keep credentials in a `.env` file rather than the chat. They
always ask before doing anything that writes, such as subscribing a fan or
tracking a conversion.

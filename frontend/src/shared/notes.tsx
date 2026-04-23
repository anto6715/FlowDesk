import {
  Fragment,
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";

import {
  type NoteBlock,
  type NoteBlockReferenceInput,
  type Task
} from "./api";
import { TaskSelect } from "./forms";

const UUID_PATTERN =
  "[0-9a-fA-F]{8}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{12}";
const inlineTokenPattern = new RegExp(
  [
    `\\[\\[(task|experiment):(${UUID_PATTERN})(?:\\|([^\\]]+))?\\]\\]`,
    "\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)",
    "`([^`]+)`",
    "\\*\\*([^*]+)\\*\\*",
    "\\*([^*]+)\\*"
  ].join("|"),
  "g"
);

function formatNoteDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function wasEdited(block: NoteBlock) {
  return Math.abs(new Date(block.updated_at).getTime() - new Date(block.created_at).getTime()) > 1000;
}

function shortenId(id: string) {
  return id.slice(0, 8);
}

function taskLinkIds(block: NoteBlock) {
  return block.links
    .filter((link) => link.target_type === "task" && link.target_id !== null)
    .map((link) => link.target_id as string);
}

function experimentLinkIds(block: NoteBlock) {
  return block.links
    .filter((link) => link.target_type === "experiment" && link.target_id !== null)
    .map((link) => link.target_id as string);
}

function tagNames(block: NoteBlock) {
  return block.links
    .filter((link) => link.target_type === "tag" && link.tag_name !== null)
    .map((link) => link.tag_name as string);
}

function renderTextWithBreaks(text: string, keyPrefix: string) {
  const parts = text.split("\n");

  return parts.flatMap<ReactNode>((part, index) => {
    if (index === 0) {
      return [part];
    }

    return [<br key={`${keyPrefix}-br-${index}`} />, part];
  });
}

function renderInlineMarkdown(
  text: string,
  keyPrefix: string,
  taskLookup: Map<string, Task>,
  onOpenTask?: (taskId: string) => void
) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  inlineTokenPattern.lastIndex = 0;

  for (const match of text.matchAll(inlineTokenPattern)) {
    const fullMatch = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > cursor) {
      nodes.push(
        <Fragment key={`${keyPrefix}-text-${cursor}`}>
          {renderTextWithBreaks(text.slice(cursor, matchIndex), `${keyPrefix}-text-${cursor}`)}
        </Fragment>
      );
    }

    if (match[1] && match[2]) {
      const entityType = match[1];
      const entityId = match[2];
      const explicitLabel = match[3];

      if (entityType === "task") {
        const taskTitle = taskLookup.get(entityId)?.title;
        const label = explicitLabel ?? taskTitle ?? `Task ${shortenId(entityId)}`;

        nodes.push(
          onOpenTask ? (
            <button
              className="markdown-ref markdown-ref--button"
              key={`${keyPrefix}-task-${entityId}-${matchIndex}`}
              onClick={() => onOpenTask(entityId)}
              type="button"
            >
              {label}
            </button>
          ) : (
            <span className="markdown-ref" key={`${keyPrefix}-task-${entityId}-${matchIndex}`}>
              {label}
            </span>
          )
        );
      } else {
        nodes.push(
          <span className="markdown-ref markdown-ref--experiment" key={`${keyPrefix}-experiment-${entityId}-${matchIndex}`}>
            {explicitLabel ?? `Experiment ${shortenId(entityId)}`}
          </span>
        );
      }
    } else if (match[4] && match[5]) {
      nodes.push(
        <a
          className="text-link"
          href={match[5]}
          key={`${keyPrefix}-link-${matchIndex}`}
          rel="noreferrer"
          target="_blank"
        >
          {match[4]}
        </a>
      );
    } else if (match[6]) {
      nodes.push(
        <code className="markdown-inline-code" key={`${keyPrefix}-code-${matchIndex}`}>
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${matchIndex}`}>{match[7]}</strong>
      );
    } else if (match[8]) {
      nodes.push(<em key={`${keyPrefix}-em-${matchIndex}`}>{match[8]}</em>);
    }

    cursor = matchIndex + fullMatch.length;
  }

  if (cursor < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-tail-${cursor}`}>
        {renderTextWithBreaks(text.slice(cursor), `${keyPrefix}-tail-${cursor}`)}
      </Fragment>
    );
  }

  return nodes;
}

function renderMarkdownBlocks(
  content: string,
  taskLookup: Map<string, Task>,
  onOpenTask?: (taskId: string) => void
) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const contentNodes = renderInlineMarkdown(
        headingMatch[2],
        `heading-${index}`,
        taskLookup,
        onOpenTask
      );

      if (level === 1) {
        blocks.push(
          <h3 className="markdown-heading markdown-heading--large" key={`heading-${index}`}>
            {contentNodes}
          </h3>
        );
      } else if (level === 2) {
        blocks.push(
          <h4 className="markdown-heading" key={`heading-${index}`}>
            {contentNodes}
          </h4>
        );
      } else {
        blocks.push(
          <h5 className="markdown-heading markdown-heading--small" key={`heading-${index}`}>
            {contentNodes}
          </h5>
        );
      }
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote className="markdown-quote" key={`quote-${index}`}>
          {renderMarkdownBlocks(quoteLines.join("\n"), taskLookup, onOpenTask)}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul className="markdown-list" key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`ul-${index}-${itemIndex}`}>
              {renderInlineMarkdown(item, `ul-${index}-${itemIndex}`, taskLookup, onOpenTask)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol className="markdown-list markdown-list--ordered" key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`ol-${index}-${itemIndex}`}>
              {renderInlineMarkdown(item, `ol-${index}-${itemIndex}`, taskLookup, onOpenTask)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(
      <p className="markdown-paragraph" key={`paragraph-${index}`}>
        {renderInlineMarkdown(paragraphLines.join("\n"), `paragraph-${index}`, taskLookup, onOpenTask)}
      </p>
    );
  }

  return blocks;
}

export function primaryTaskIdForNoteBlock(block: NoteBlock) {
  return taskLinkIds(block)[0] ?? "";
}

interface BulletNoteEditorProps {
  autoFocus?: boolean;
  cancelLabel?: string;
  compact?: boolean;
  initialContent?: string;
  initialTaskId?: string;
  onCancel?: () => void;
  onError: (message: string | null) => void;
  onSubmit: (input: { contentMarkdown: string; references: NoteBlockReferenceInput[] }) => Promise<void>;
  placeholder?: string;
  submitLabel: string;
  submittingLabel: string;
  tasks: Task[];
}

export function BulletNoteEditor({
  autoFocus = false,
  cancelLabel = "Cancel",
  compact = false,
  initialContent = "",
  initialTaskId = "",
  onCancel,
  onError,
  onSubmit,
  placeholder = "Capture the note while the context is fresh.",
  submitLabel,
  submittingLabel,
  tasks
}: BulletNoteEditorProps) {
  const [contentMarkdown, setContentMarkdown] = useState(initialContent);
  const [taskId, setTaskId] = useState(initialTaskId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setContentMarkdown(initialContent);
  }, [initialContent]);

  useEffect(() => {
    setTaskId(initialTaskId);
  }, [initialTaskId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (contentMarkdown.trim().length === 0) {
      onError("Note content is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        contentMarkdown: contentMarkdown.trim(),
        references:
          taskId.length > 0
            ? [{ target_type: "task", target_id: taskId }]
            : []
      });
      onError(null);
      setContentMarkdown("");
      setTaskId("");
    } catch (submitError) {
      onError(submitError instanceof Error ? submitError.message : "Failed to save note.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }

    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form
      className={compact ? "compact-form compact-form--flush note-editor note-editor--compact" : "compact-form compact-form--flush note-editor"}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <TaskSelect
        includeUnassigned
        label="Linked task"
        onChange={setTaskId}
        tasks={tasks}
        value={taskId}
      />
      <label className="note-editor__body">
        <span>Bullet</span>
        <textarea
          autoFocus={autoFocus}
          onChange={(event) => setContentMarkdown(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={compact ? 5 : 8}
          value={contentMarkdown}
        />
      </label>
      <div className="note-editor__hint">
        Markdown is supported. Use <code>#tags</code>. Press Ctrl/Cmd+Enter to save.
      </div>
      <div className="note-editor__actions">
        {onCancel ? (
          <button className="button button--ghost" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
        ) : null}
        <button className="button button--accent" disabled={isSubmitting} type="submit">
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

interface BulletNoteCardProps {
  block: NoteBlock;
  onEdit?: (block: NoteBlock) => void;
  onOpenTask?: (taskId: string) => void;
  taskLookup: Map<string, Task>;
}

export function BulletNoteCard({
  block,
  onEdit,
  onOpenTask,
  taskLookup
}: BulletNoteCardProps) {
  const linkedTaskIds = taskLinkIds(block);
  const linkedExperimentIds = experimentLinkIds(block);
  const linkedTags = tagNames(block);

  return (
    <li className="bullet-note">
      <div className="bullet-note__meta">
        <div className="bullet-note__timestamps">
          <time>{formatNoteDateTime(block.created_at)}</time>
          {wasEdited(block) ? (
            <span className="bullet-note__edited">Edited {formatNoteDateTime(block.updated_at)}</span>
          ) : null}
        </div>
        {onEdit ? (
          <button
            className="button button--ghost button--mini bullet-note__edit"
            onClick={() => onEdit(block)}
            type="button"
          >
            Edit
          </button>
        ) : null}
      </div>

      {linkedTaskIds.length > 0 || linkedTags.length > 0 || linkedExperimentIds.length > 0 ? (
        <div className="bullet-note__chips">
          {linkedTaskIds.map((taskId) =>
            onOpenTask ? (
              <button
                className="note-link-chip note-link-chip--button"
                key={`task-${taskId}`}
                onClick={() => onOpenTask(taskId)}
                type="button"
              >
                {taskLookup.get(taskId)?.title ?? `Task ${shortenId(taskId)}`}
              </button>
            ) : (
              <span className="note-link-chip" key={`task-${taskId}`}>
                {taskLookup.get(taskId)?.title ?? `Task ${shortenId(taskId)}`}
              </span>
            )
          )}
          {linkedExperimentIds.map((experimentId) => (
            <span
              className="note-link-chip note-link-chip--experiment"
              key={`experiment-${experimentId}`}
            >
              Experiment {shortenId(experimentId)}
            </span>
          ))}
          {linkedTags.map((tagName) => (
            <span className="note-link-chip note-link-chip--tag" key={`tag-${tagName}`}>
              #{tagName}
            </span>
          ))}
        </div>
      ) : null}

      <div className="markdown-content">
        {renderMarkdownBlocks(block.content_markdown, taskLookup, onOpenTask)}
      </div>
    </li>
  );
}

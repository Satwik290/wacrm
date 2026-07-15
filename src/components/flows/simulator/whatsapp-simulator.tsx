'use client';

/**
 * WhatsApp Simulator Panel - Phase 1
 *
 * Renders a premium dark phone mockup containing a WhatsApp-style chat
 * interface that drives a client-side state machine over the current
 * flow nodes. The simulator reads from useFlowEditor() - the same
 * context used by the canvas and list views - so it always reflects
 * the latest unsaved edits without any extra wiring.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  List,
  Play,
  RotateCcw,
  Send,
  Smartphone,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { useFlowEditor } from '../flow-editor-state';
import { type BuilderNode, type NodeType } from '../shared';

// Session state types
type MessageSender = 'bot' | 'customer' | 'system';
type MessageType =
  | 'text'
  | 'buttons'
  | 'list'
  | 'media'
  | 'input_prompt'
  | 'system_event';

interface SimMessage {
  id: string;
  sender: MessageSender;
  type: MessageType;
  content: unknown;
  timestamp: Date;
}

interface SimulatorSession {
  history: SimMessage[];
  currentNodeKey: string | null;
  vars: Record<string, string>;
  status: 'idle' | 'running' | 'awaiting_input' | 'ended';
}

const EMPTY_SESSION: SimulatorSession = {
  history: [],
  currentNodeKey: null,
  vars: {},
  status: 'idle',
};

function msgId(): string {
  return Math.random().toString(36).slice(2);
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function WhatsAppSimulator() {
  const { state } = useFlowEditor();
  const { nodes, entry_node_id } = state;

  const [session, setSession] = useState<SimulatorSession>(EMPTY_SESSION);
  const [inputValue, setInputValue] = useState('');
  const [listOpen, setListOpen] = useState<string | null>(null);
  const [conditionNodeKey, setConditionNodeKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.history]);

  const findNode = useCallback(
    (key: string | null): BuilderNode | undefined => {
      if (!key) return undefined;
      return nodes.find((n) => n.node_key === key);
    },
    [nodes],
  );

  const processNode = useCallback(
    function processNodeInner(nodeKey: string, currentSession: SimulatorSession): SimulatorSession {
      const node = nodes.find((n) => n.node_key === nodeKey);
      if (!node) {
        return {
          ...currentSession,
          status: 'ended',
          history: [
            ...currentSession.history,
            {
              id: msgId(),
              sender: 'system',
              type: 'system_event',
              content: `Node "${nodeKey}" not found - flow ended.`,
              timestamp: new Date(),
            },
          ],
        };
      }

      const cfg = node.config;
      const type = node.node_type as NodeType;

      switch (type) {
        case 'start': {
          const next = str(cfg.next_node_key);
          const updated: SimulatorSession = {
            ...currentSession,
            currentNodeKey: next || null,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'system',
                type: 'system_event',
                content: 'Flow started',
                timestamp: new Date(),
              },
            ],
          };
          return next ? processNodeInner(next, updated) : { ...updated, status: 'ended' };
        }

        case 'send_message': {
          const text = str(cfg.text, '(empty message)');
          const next = str(cfg.next_node_key);
          const updated: SimulatorSession = {
            ...currentSession,
            currentNodeKey: next || null,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'bot',
                type: 'text',
                content: text,
                timestamp: new Date(),
              },
            ],
          };
          return next ? processNodeInner(next, updated) : { ...updated, status: 'ended' };
        }

        case 'send_buttons': {
          return {
            ...currentSession,
            currentNodeKey: nodeKey,
            status: 'awaiting_input',
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'bot',
                type: 'buttons',
                content: {
                  text: str(cfg.text, '(choose an option)'),
                  buttons: arr<{ reply_id: string; title: string; next_node_key: string }>(cfg.buttons),
                },
                timestamp: new Date(),
              },
            ],
          };
        }

        case 'send_list': {
          return {
            ...currentSession,
            currentNodeKey: nodeKey,
            status: 'awaiting_input',
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'bot',
                type: 'list',
                content: {
                  text: str(cfg.text, '(choose from list)'),
                  button_label: str(cfg.button_label, 'View options'),
                  sections: arr<{
                    title?: string;
                    rows: Array<{ reply_id: string; title: string; description?: string; next_node_key: string }>;
                  }>(cfg.sections),
                },
                timestamp: new Date(),
              },
            ],
          };
        }

        case 'send_media': {
          const mediaType = str(cfg.media_type, 'image');
          const caption = str(cfg.caption);
          const next = str(cfg.next_node_key);
          const updated: SimulatorSession = {
            ...currentSession,
            currentNodeKey: next || null,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'bot',
                type: 'media',
                content: { mediaType, caption },
                timestamp: new Date(),
              },
            ],
          };
          return next ? processNodeInner(next, updated) : { ...updated, status: 'ended' };
        }

        case 'collect_input': {
          const prompt = str(cfg.prompt_text, '(enter your reply)');
          return {
            ...currentSession,
            currentNodeKey: nodeKey,
            status: 'awaiting_input',
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'bot',
                type: 'input_prompt',
                content: { prompt },
                timestamp: new Date(),
              },
            ],
          };
        }

        case 'condition': {
          return {
            ...currentSession,
            currentNodeKey: nodeKey,
            status: 'awaiting_input',
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'system',
                type: 'system_event',
                content: `Condition node "${nodeKey}" - pick branch`,
                timestamp: new Date(),
              },
            ],
          };
        }

        case 'set_tag': {
          const mode = str(cfg.mode, 'add');
          const tag = str(cfg.tag_id, '(no tag)').slice(0, 8);
          const next = str(cfg.next_node_key);
          const updated: SimulatorSession = {
            ...currentSession,
            currentNodeKey: next || null,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'system',
                type: 'system_event',
                content: `${mode === 'remove' ? 'Removed' : 'Added'} tag ${tag}...`,
                timestamp: new Date(),
              },
            ],
          };
          return next ? processNodeInner(next, updated) : { ...updated, status: 'ended' };
        }

        case 'http_fetch': {
          const method = str(cfg.method, 'GET');
          const url = str(cfg.url, '(no url)');
          const next = str(cfg.next_node_key);
          const updated: SimulatorSession = {
            ...currentSession,
            currentNodeKey: next || null,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'system',
                type: 'system_event',
                content: `HTTP ${method} ${url.length > 40 ? url.slice(0, 40) + '...' : url}`,
                timestamp: new Date(),
              },
            ],
          };
          return next ? processNodeInner(next, updated) : { ...updated, status: 'ended' };
        }

        case 'handoff': {
          const note = str(cfg.note);
          return {
            ...currentSession,
            currentNodeKey: null,
            status: 'ended',
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'system',
                type: 'system_event',
                content: `Handed off to human agent${note ? ` - "${note}"` : ''}`,
                timestamp: new Date(),
              },
            ],
          };
        }

        case 'handoff_ai': {
          const note = str(cfg.note);
          return {
            ...currentSession,
            currentNodeKey: null,
            status: 'ended',
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'system',
                type: 'system_event',
                content: `Handed off to AI bot${note ? ` - "${note}"` : ''}`,
                timestamp: new Date(),
              },
            ],
          };
        }

        case 'end': {
          return {
            ...currentSession,
            currentNodeKey: null,
            status: 'ended',
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'system',
                type: 'system_event',
                content: 'Flow ended',
                timestamp: new Date(),
              },
            ],
          };
        }

        default: {
          return {
            ...currentSession,
            status: 'ended',
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: 'system',
                type: 'system_event',
                content: `Unknown node type "${type}"`,
                timestamp: new Date(),
              },
            ],
          };
        }
      }
    },
    [nodes],
  );

  const handlePlay = useCallback(() => {
    if (!entry_node_id) {
      setSession({
        ...EMPTY_SESSION,
        status: 'ended',
        history: [
          {
            id: msgId(),
            sender: 'system',
            type: 'system_event',
            content: 'No entry node set - configure one in the flow settings.',
            timestamp: new Date(),
          },
        ],
      });
      return;
    }
    const init: SimulatorSession = { ...EMPTY_SESSION, status: 'running' };
    setSession(processNode(entry_node_id, init));
  }, [entry_node_id, processNode]);

  const handleReset = useCallback(() => {
    setSession(EMPTY_SESSION);
    setInputValue('');
    setListOpen(null);
    setConditionNodeKey(null);
  }, []);

  const handleButtonTap = useCallback(
    (title: string, nextNodeKey: string) => {
      if (session.status !== 'awaiting_input') return;
      const customerMsg: SimMessage = {
        id: msgId(),
        sender: 'customer',
        type: 'text',
        content: title,
        timestamp: new Date(),
      };
      const updated: SimulatorSession = {
        ...session,
        status: 'running',
        history: [...session.history, customerMsg],
      };
      setSession(nextNodeKey ? processNode(nextNodeKey, updated) : { ...updated, status: 'ended' });
    },
    [session, processNode],
  );

  const handleListRowTap = useCallback(
    (title: string, nextNodeKey: string) => {
      if (session.status !== 'awaiting_input') return;
      setListOpen(null);
      const customerMsg: SimMessage = {
        id: msgId(),
        sender: 'customer',
        type: 'text',
        content: title,
        timestamp: new Date(),
      };
      const updated: SimulatorSession = {
        ...session,
        status: 'running',
        history: [...session.history, customerMsg],
      };
      setSession(nextNodeKey ? processNode(nextNodeKey, updated) : { ...updated, status: 'ended' });
    },
    [session, processNode],
  );

  const handleTextSubmit = useCallback(() => {
    if (session.status !== 'awaiting_input' || !inputValue.trim()) return;
    const currentNode = findNode(session.currentNodeKey);
    if (!currentNode || currentNode.node_type !== 'collect_input') return;

    const varKey = str(currentNode.config.var_key, 'answer');
    const nextNodeKey = str(currentNode.config.next_node_key);
    const customerMsg: SimMessage = {
      id: msgId(),
      sender: 'customer',
      type: 'text',
      content: inputValue.trim(),
      timestamp: new Date(),
    };
    const updated: SimulatorSession = {
      ...session,
      status: 'running',
      vars: { ...session.vars, [varKey]: inputValue.trim() },
      history: [...session.history, customerMsg],
    };
    setInputValue('');
    setSession(nextNodeKey ? processNode(nextNodeKey, updated) : { ...updated, status: 'ended' });
  }, [session, inputValue, findNode, processNode]);

  const handleConditionBranch = useCallback(
    (branch: 'true' | 'false') => {
      if (!conditionNodeKey) return;
      const node = findNode(conditionNodeKey);
      if (!node) return;
      const nextKey = str(
        branch === 'true' ? node.config.true_next : node.config.false_next,
      );
      const customerMsg: SimMessage = {
        id: msgId(),
        sender: 'customer',
        type: 'text',
        content: branch === 'true' ? 'True branch' : 'False branch',
        timestamp: new Date(),
      };
      const updated: SimulatorSession = {
        ...session,
        status: 'running',
        history: [...session.history, customerMsg],
      };
      setConditionNodeKey(null);
      setSession(nextKey ? processNode(nextKey, updated) : { ...updated, status: 'ended' });
    },
    [conditionNodeKey, findNode, session, processNode],
  );

  useEffect(() => {
    if (session.status === 'awaiting_input' && session.currentNodeKey) {
      const node = findNode(session.currentNodeKey);
      if (node?.node_type === 'condition') {
        setConditionNodeKey(session.currentNodeKey);
      }
    }
  }, [session.status, session.currentNodeKey, findNode]);

  const showTextInput =
    session.status === 'awaiting_input' &&
    session.currentNodeKey &&
    findNode(session.currentNodeKey)?.node_type === 'collect_input';

  return (
    <div className="flex min-h-full flex-col items-center justify-start rounded-xl bg-[#0d1117] px-3 py-4">
      {/* Toolbar */}
      <div className="mb-3 flex w-full items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5 text-[#00a884]" />
          <span className="text-[11px] font-semibold tracking-wide text-[#aebac1]">
            SIMULATOR
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#8696a0] transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <button
            type="button"
            onClick={handlePlay}
            disabled={session.status === 'running' || session.status === 'awaiting_input'}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
              session.status === 'idle' || session.status === 'ended'
                ? 'bg-[#00a884] text-white hover:bg-[#00c99e]'
                : 'cursor-not-allowed bg-[#00a884]/30 text-[#00a884]/60',
            )}
          >
            <Play className="h-3 w-3" />
            Play
          </button>
        </div>
      </div>

      {/* Phone frame */}
      <div
        className="relative flex flex-col overflow-hidden rounded-[2.2rem] shadow-2xl shadow-black/60"
        style={{
          width: 280,
          height: 560,
          background: '#111b21',
          border: '2px solid #2a3942',
          boxShadow: '0 0 0 6px #0d1117, 0 24px 48px rgba(0,0,0,0.7)',
          flexShrink: 0,
        }}
      >
        {/* Notch */}
        <div
          className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black px-3 py-1"
          style={{ width: 80, height: 20 }}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-[#2a3942]" />
          <div className="mx-auto h-1 w-8 rounded-full bg-[#2a3942]" />
          <div className="h-1.5 w-1.5 rounded-full bg-[#2a3942]" />
        </div>

        {/* Chat header */}
        <div className="flex items-center gap-2.5 bg-[#202c33] px-3 pb-2.5 pt-8">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00a884]/20">
            <Bot className="h-4 w-4 text-[#00a884]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-white">
              Flow Bot
            </p>
            <p className="text-[10px] text-[#8696a0]">
              {session.status === 'idle' && 'Press Play to start'}
              {session.status === 'running' && 'typing...'}
              {session.status === 'awaiting_input' && 'waiting for reply'}
              {session.status === 'ended' && 'session ended'}
            </p>
          </div>
          {session.status !== 'idle' && (
            <Badge
              variant="secondary"
              className={cn(
                'shrink-0 px-1.5 py-0 text-[9px]',
                session.status === 'ended'
                  ? 'bg-[#2a3942] text-[#8696a0]'
                  : 'bg-[#00a884]/20 text-[#00a884]',
              )}
            >
              {session.status}
            </Badge>
          )}
        </div>

        {/* Chat messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-2 py-2"
          style={{ background: '#111b21', scrollbarWidth: 'none' }}
        >
          {session.history.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Smartphone className="h-8 w-8 text-[#2a3942]" />
              <p className="text-[11px] text-[#2a3942]">
                Press Play to simulate the flow
              </p>
            </div>
          )}

          {session.history.map((msg) => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              onButtonTap={handleButtonTap}
              onListOpen={(key) => setListOpen(key)}
              listOpenKey={listOpen}
              onListRowTap={handleListRowTap}
            />
          ))}

          {/* Condition branch picker */}
          {conditionNodeKey && (
            <div className="my-2 flex flex-col items-center gap-1.5">
              <p className="text-[10px] text-[#8696a0]">Pick simulation branch:</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleConditionBranch('true')}
                  className="rounded-full border border-[#00a884] px-3 py-0.5 text-[11px] text-[#00a884] transition-colors hover:bg-[#00a884]/20"
                >
                  True
                </button>
                <button
                  type="button"
                  onClick={() => handleConditionBranch('false')}
                  className="rounded-full border border-[#ef4444] px-3 py-0.5 text-[11px] text-[#ef4444] transition-colors hover:bg-[#ef4444]/20"
                >
                  False
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Text input for collect_input */}
        {showTextInput && (
          <div className="flex items-center gap-1.5 border-t border-[#2a3942] bg-[#202c33] px-2 py-2">
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
              }}
              placeholder="Type a reply..."
              className="flex-1 rounded-full bg-[#2a3942] px-3 py-1.5 text-[12px] text-white placeholder:text-[#8696a0] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleTextSubmit}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00a884] transition-colors hover:bg-[#00c99e]"
            >
              <Send className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
        )}

        {/* Bottom home indicator */}
        <div className="flex justify-center bg-[#111b21] pb-1.5 pt-1">
          <div className="h-1 w-14 rounded-full bg-[#2a3942]" />
        </div>
      </div>

      {/* Vars inspector */}
      {Object.keys(session.vars).length > 0 && (
        <div className="mt-3 w-full rounded-xl border border-[#2a3942] bg-[#202c33] p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#8696a0]">
            Captured vars
          </p>
          <div className="flex flex-col gap-1">
            {Object.entries(session.vars).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#8696a0]">
                  vars.{k}
                </span>
                <span className="max-w-[120px] truncate rounded bg-[#2a3942] px-1.5 py-0.5 font-mono text-[10px] text-[#00a884]">
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ChatMessage component
interface ChatMessageProps {
  msg: SimMessage;
  onButtonTap: (title: string, nextNodeKey: string) => void;
  onListOpen: (nodeKey: string) => void;
  listOpenKey: string | null;
  onListRowTap: (title: string, nextNodeKey: string) => void;
}

function ChatMessage({
  msg,
  onButtonTap,
  onListOpen,
  listOpenKey,
  onListRowTap,
}: ChatMessageProps) {
  if (msg.sender === 'system') {
    return (
      <div className="my-1.5 flex justify-center">
        <span className="rounded-full bg-[#182229] px-2.5 py-0.5 text-[10px] text-[#8696a0]">
          {msg.content as string}
        </span>
      </div>
    );
  }

  const isBot = msg.sender === 'bot';
  const bubbleBase = 'max-w-[210px] rounded-xl px-3 py-2 text-[12px] leading-relaxed shadow-sm';
  const botBubble = cn(bubbleBase, 'bg-[#202c33] text-white rounded-tl-none');
  const customerBubble = cn(bubbleBase, 'bg-[#005c4b] text-white rounded-tr-none ml-auto');

  return (
    <div className={cn('mb-2 flex flex-col', isBot ? 'items-start' : 'items-end')}>
      {(msg.type === 'text' || msg.type === 'input_prompt') && (
        <div className={isBot ? botBubble : customerBubble}>
          {msg.type === 'input_prompt'
            ? (msg.content as { prompt: string }).prompt
            : (msg.content as string)}
          <span className="ml-1.5 text-[9px] opacity-50">{fmtTime(msg.timestamp)}</span>
        </div>
      )}

      {msg.type === 'media' && (
        <div className={botBubble}>
          <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-[#2a3942] px-2 py-1.5">
            <span className="text-[16px]">
              {(msg.content as { mediaType: string }).mediaType === 'video'
                ? '\uD83C\uDFAC'
                : (msg.content as { mediaType: string }).mediaType === 'document'
                  ? '\uD83D\uDCC4'
                  : '\uD83D\uDDBC'}
            </span>
            <span className="text-[11px] capitalize text-[#aebac1]">
              {(msg.content as { mediaType: string }).mediaType}
            </span>
          </div>
          {(msg.content as { caption: string }).caption && (
            <p className="text-[11px] text-[#aebac1]">
              {(msg.content as { caption: string }).caption}
            </p>
          )}
          <span className="text-[9px] opacity-50">{fmtTime(msg.timestamp)}</span>
        </div>
      )}

      {msg.type === 'buttons' && (
        <>
          <div className={botBubble}>
            {(msg.content as { text: string }).text}
            <span className="ml-1.5 text-[9px] opacity-50">{fmtTime(msg.timestamp)}</span>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {(
              msg.content as {
                buttons: Array<{ reply_id: string; title: string; next_node_key: string }>;
              }
            ).buttons.map((btn) => (
              <button
                key={btn.reply_id}
                type="button"
                onClick={() => onButtonTap(btn.title, btn.next_node_key)}
                className="rounded-full border border-[#00a884]/60 bg-[#202c33] px-4 py-1 text-[11px] text-[#00a884] transition-colors hover:bg-[#00a884]/20 active:scale-95"
              >
                {btn.title}
              </button>
            ))}
          </div>
        </>
      )}

      {msg.type === 'list' && (() => {
        const c = msg.content as {
          text: string;
          button_label: string;
          sections: Array<{
            title?: string;
            rows: Array<{ reply_id: string; title: string; description?: string; next_node_key: string }>;
          }>;
        };
        const isOpen = listOpenKey === msg.id;
        return (
          <>
            <div className={botBubble}>
              {c.text}
              <span className="ml-1.5 text-[9px] opacity-50">{fmtTime(msg.timestamp)}</span>
            </div>
            <button
              type="button"
              onClick={() => onListOpen(isOpen ? '' : msg.id)}
              className="mt-1 flex items-center gap-1 rounded-full border border-[#00a884]/60 bg-[#202c33] px-3 py-1 text-[11px] text-[#00a884] transition-colors hover:bg-[#00a884]/20"
            >
              <List className="h-3 w-3" />
              {c.button_label}
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')}
              />
            </button>
            {isOpen && (
              <div className="mt-1 w-[220px] overflow-hidden rounded-xl border border-[#2a3942] bg-[#202c33] shadow-lg">
                {c.sections.map((sec, si) => (
                  <div key={si}>
                    {sec.title && (
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#8696a0]">
                        {sec.title}
                      </p>
                    )}
                    {sec.rows.map((row) => (
                      <button
                        key={row.reply_id}
                        type="button"
                        onClick={() => onListRowTap(row.title, row.next_node_key)}
                        className="flex w-full items-start gap-2 border-t border-[#2a3942] px-3 py-2 text-left transition-colors hover:bg-[#2a3942]/60"
                      >
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00a884]" />
                        <div className="min-w-0">
                          <p className="truncate text-[12px] text-white">{row.title}</p>
                          {row.description && (
                            <p className="truncate text-[10px] text-[#8696a0]">
                              {row.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
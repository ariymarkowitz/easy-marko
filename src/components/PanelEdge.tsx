import type { JSX } from '@solidjs/web';
import { createSignal, For, onSettled } from 'solid-js';
import { ChevronLeft, ChevronRight, Eye, PanelLeft, type IconNode } from 'lucide';
import { CLICK_SLOP, trackDrag } from '../lib/drag';
import { useListeners } from '../reactive';
import { hidePane, revealPane, startSidebarDrag, startSplitDrag } from '../state/layout';
import { setSidebarOpen } from '../state/settings';
import Icon from './Icon';
import { SourceIcon } from './icons';

export interface EdgeAction {
  icon: IconNode;
  label: string;
  /** The id of the panel it shows or hides. */
  controls: string;
  onClick: () => void;
  /** Starts a drag of the button, as if dragging the panel's resizer; returns what follows the pointer's clientX. */
  onDragStart: () => (clientX: number) => void;
}

/** How close, in pixels, the pointer comes to a resizer to reveal its buttons: its hit area. */
const RESIZER_REVEAL_DISTANCE = 4;
/** How close the pointer comes to the window's edge to reveal the buttons there. */
const WINDOW_EDGE_REVEAL_DISTANCE = 16;
/** How far the pointer moves from an edge, once its buttons show and it's not over them, before they hide. */
const HIDE_DISTANCE = 20;
/** How long, in milliseconds, the pointer stays near an edge before its buttons show. */
const REVEAL_DELAY = 200;

const sidebar = { controls: 'sidebar', onDragStart: startSidebarDrag };
const sourcePane = { controls: 'source-pane', onDragStart: startSplitDrag };
const previewPane = { controls: 'preview-pane', onDragStart: startSplitDrag };

/** The buttons that edges show. Constant, so edges keep their buttons as the layout changes. */
export const edgeActions = {
  showSidebar: { ...sidebar, icon: PanelLeft, label: 'Show sidebar', onClick: () => setSidebarOpen(true) },
  hideSidebar: { ...sidebar, icon: ChevronLeft, label: 'Hide sidebar', onClick: () => setSidebarOpen(false) },
  showSource: { ...sourcePane, icon: SourceIcon, label: 'Show source', onClick: () => revealPane('source') },
  hideSource: { ...sourcePane, icon: ChevronLeft, label: 'Hide source', onClick: () => hidePane('source') },
  showPreview: { ...previewPane, icon: Eye, label: 'Show preview', onClick: () => revealPane('preview') },
  hidePreview: { ...previewPane, icon: ChevronRight, label: 'Hide preview', onClick: () => hidePane('preview') },
} satisfies Record<string, EdgeAction>;

/**
 * A vertical edge of a panel, which shows buttons beside it when the pointer
 * stays near it for a moment, until the pointer moves further away: at
 * a resizer (its child) between two panels, or at the window's edge where
 * hidden panels would be (`position`). Clicking a button runs its action;
 * dragging it drags the edge.
 */
export default function PanelEdge(props: {
  /** Set for an edge at the window's start or end, with no resizer. */
  position?: 'start' | 'end';
  /** Buttons on the edge's left. */
  before?: EdgeAction[];
  /** Buttons on the edge's right. */
  after?: EdgeAction[];
  children?: JSX.Element;
}) {
  let edge!: HTMLDivElement;
  const [revealed, setRevealed] = createSignal(false);
  let revealTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelReveal = () => {
    clearTimeout(revealTimer);
    revealTimer = undefined;
  };

  /** How far the pointer is from the edge, or `undefined` when it isn't alongside it. */
  function distanceTo(event: PointerEvent): number | undefined {
    const bounds = edge.getBoundingClientRect();
    if (event.clientY < bounds.top || event.clientY > bounds.bottom) return undefined;
    return Math.abs(event.clientX - (bounds.left + bounds.width / 2));
  }

  /**
   * Where a pointer that left the window left it, as a distance from the edge.
   * A pointer that overshoots the window's side is last seen some way inside
   * it, so leaving closer to this edge's side than to the top or bottom counts
   * as reaching the edge.
   */
  function exitDistance(event: PointerEvent): number | undefined {
    const toSide =
      props.position === 'start'
        ? event.clientX
        : props.position === 'end'
          ? window.innerWidth - event.clientX
          : Infinity;
    const toTopOrBottom = Math.min(event.clientY, window.innerHeight - event.clientY);
    return toSide < toTopOrBottom && toSide < window.innerWidth / 2 ? 0 : undefined;
  }

  function update(event: PointerEvent, distance: number | undefined) {
    if (event.pointerType === 'touch') return;
    if (revealed()) {
      const overButtons = event.target instanceof Node && edge.contains(event.target);
      if (!overButtons && (distance === undefined || distance > HIDE_DISTANCE)) setRevealed(false);
      return;
    }
    const revealDistance = props.position ? WINDOW_EDGE_REVEAL_DISTANCE : RESIZER_REVEAL_DISTANCE;
    // Not while a button is held, as when selecting text past the edge.
    if (distance !== undefined && distance <= revealDistance && event.buttons === 0) {
      revealTimer ??= setTimeout(() => {
        revealTimer = undefined;
        setRevealed(true);
      }, REVEAL_DELAY);
    } else cancelReveal();
  }

  // Tracked on the window rather than with a hover area, so the area near the
  // window's edges still takes clicks (on a scrollbar, for example).
  useListeners(window, { pointermove: (event) => update(event, distanceTo(event)) });
  useListeners(document, {
    pointerout: (event) => {
      if (!event.relatedTarget) update(event, exitDistance(event));
    },
  });
  onSettled(() => cancelReveal);

  return (
    <div
      ref={(element) => (edge = element)}
      class={['panel-edge', props.position && `panel-edge-${props.position}`, { revealed: revealed() }]}
    >
      {props.children}
      <div class="panel-edge-buttons before">
        <For each={props.before}>{(action) => <EdgeButton action={action} />}</For>
      </div>
      <div class="panel-edge-buttons after">
        <For each={props.after}>{(action) => <EdgeButton action={action} />}</For>
      </div>
    </div>
  );
}

function EdgeButton(props: { action: EdgeAction }) {
  return (
    <button
      type="button"
      class="icon-button panel-edge-button"
      // Out of the tab order: the toolbar has the same controls.
      tabindex="-1"
      title={props.action.label}
      aria-label={props.action.label}
      aria-controls={props.action.controls}
      onPointerDown={(event) =>
        trackDrag(event, { threshold: CLICK_SLOP, onMove: props.action.onDragStart() })
      }
      onClick={() => props.action.onClick()}
    >
      <Icon icon={props.action.icon} />
    </button>
  );
}

import { Handle, Position } from "@xyflow/react";

/** Handle IDs shared between node components and graph-layout.ts */
export const HANDLE_ID = {
  targetTop: "t-top",
  targetBottom: "t-bottom",
  targetLeft: "t-left",
  targetRight: "t-right",
  sourceTop: "s-top",
  sourceBottom: "s-bottom",
  sourceLeft: "s-left",
  sourceRight: "s-right",
} as const;

const HANDLE_CLASS = "!bg-transparent !w-2 !h-2";

/** Renders target + source handles on all 4 sides for nearest-edge routing. */
export function NodeHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} id={HANDLE_ID.targetTop} className={HANDLE_CLASS} />
      <Handle type="target" position={Position.Bottom} id={HANDLE_ID.targetBottom} className={HANDLE_CLASS} />
      <Handle type="target" position={Position.Left} id={HANDLE_ID.targetLeft} className={HANDLE_CLASS} />
      <Handle type="target" position={Position.Right} id={HANDLE_ID.targetRight} className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Top} id={HANDLE_ID.sourceTop} className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Bottom} id={HANDLE_ID.sourceBottom} className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Left} id={HANDLE_ID.sourceLeft} className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Right} id={HANDLE_ID.sourceRight} className={HANDLE_CLASS} />
    </>
  );
}

import type { MemoryEntity } from "@/lib/api";
import { ENTITY_COLORS, type EntityType } from "./shared";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

export function MemoryPreviewContent({ entity }: { entity: MemoryEntity }) {
  const e = entity;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">{e.name}</h3>
      <span
        className="inline-block text-[10px] px-1.5 py-0.5 rounded capitalize"
        style={{
          background: ENTITY_COLORS[e.type as EntityType]?.bg ?? ENTITY_COLORS.resource.bg,
          color: ENTITY_COLORS[e.type as EntityType]?.border ?? ENTITY_COLORS.resource.border,
        }}
      >
        {e.type}
      </span>

      <div className="space-y-2">
        {e.type === "concept" && (
          <>
            <Row label="Domain" value={e.domain.replace(/-/g, " ") || undefined} />
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Mastery</span>
                <span>{Math.round(e.mastery * 100)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.round(e.mastery * 100)}%`, background: ENTITY_COLORS.concept.border }}
                />
              </div>
            </div>
            {e.confidence < 1.0 && (
              <Row label="Confidence" value={`${Math.round(e.confidence * 100)}%`} />
            )}
          </>
        )}

        {e.type === "person" && <Row label="Role" value={e.role} />}

        {e.type === "fact" && (
          <>
            <p className="text-xs text-foreground/80 italic">&ldquo;{e.statement}&rdquo;</p>
            <Row label="Verified" value={e.verified === true ? "Yes" : e.verified === false ? "No" : "Unknown"} />
            <Row label="About" value={e.about_concept_slug.replace(/-/g, " ")} />
          </>
        )}

        {e.type === "belief" && (
          <>
            <p className="text-xs text-foreground/80 italic">&ldquo;{e.statement}&rdquo;</p>
            <Row
              label="Status"
              value={e.correct === true ? "Correct" : e.correct === false ? "Incorrect" : "Unverified"}
            />
            <Row label="About" value={e.about_concept_slug.replace(/-/g, " ")} />
            {e.superseded_by && <Row label="Superseded by" value={e.superseded_by.replace(/-/g, " ")} />}
          </>
        )}

        {e.type === "resource" && (
          <>
            <Row label="Type" value={e.resource_type} />
            {e.url && (
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline truncate block"
              >
                {e.url}
              </a>
            )}
          </>
        )}

        <Row label="First seen" value={e.first_seen ? new Date(e.first_seen).toLocaleDateString() : undefined} />
        <Row label="Last seen" value={e.last_seen ? new Date(e.last_seen).toLocaleDateString() : undefined} />
      </div>
    </div>
  );
}

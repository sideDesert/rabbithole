import type { ComponentType } from "react";

// Lucide icons
import {
  Search as LucideSearch,
  ChevronRight as LucideChevronRight,
  CirclePlus as LucideCirclePlus,
  Atom as LucideAtom,
  LayoutGrid as LucideLayoutGrid,
  Network as LucideNetwork,
  Pencil as LucidePencil,
  FileText as LucideFileText,
  ListChecks as LucideListChecks,
  Dumbbell as LucideDumbbell,
} from "lucide-react";

// Solar icons
import {
  MagniferBoldDuotone,
  AltArrowRightBoldDuotone,
  AddCircleBoldDuotone,
  AtomBoldDuotone,
  Widget2BoldDuotone,
  GraphBoldDuotone,
  Pen2BoldDuotone,
  DocumentTextBoldDuotone,
  ChecklistBoldDuotone,
  DumbbellBoldDuotone,
} from "solar-icon-set";

type IconProps = { className?: string; size?: number };

export type IconName =
  | "search"
  | "chevronRight"
  | "circlePlus"
  | "atom"
  | "layoutGrid"
  | "network"
  | "pencil"
  | "fileText"
  | "listChecks"
  | "dumbbell";

export const iconMaps: Record<string, Record<IconName, ComponentType<IconProps>>> = {
  lucide: {
    search: LucideSearch,
    chevronRight: LucideChevronRight,
    circlePlus: LucideCirclePlus,
    atom: LucideAtom,
    layoutGrid: LucideLayoutGrid,
    network: LucideNetwork,
    pencil: LucidePencil,
    fileText: LucideFileText,
    listChecks: LucideListChecks,
    dumbbell: LucideDumbbell,
  },
  solar: {
    search: MagniferBoldDuotone,
    chevronRight: AltArrowRightBoldDuotone,
    circlePlus: AddCircleBoldDuotone,
    atom: AtomBoldDuotone,
    layoutGrid: Widget2BoldDuotone,
    network: GraphBoldDuotone,
    pencil: Pen2BoldDuotone,
    fileText: DocumentTextBoldDuotone,
    listChecks: ChecklistBoldDuotone,
    dumbbell: DumbbellBoldDuotone,
  },
};

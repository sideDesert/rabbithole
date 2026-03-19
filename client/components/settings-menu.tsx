"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import CreatableSelect from "react-select/creatable";
import { toast } from "sonner";

import { useThemePersonality } from "@/components/theme-personality-provider";
import {
  useConfig,
  useOpenRouterModels,
  useUpdateConfig,
} from "@/hooks/use-config";
import type { AppConfig } from "@/lib/config-api";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ConfigFormValues = {
  [K in keyof AppConfig]: string;
};

const CONFIG_FIELDS: Array<{
  key: keyof AppConfig;
  label: string;
  type?: "text" | "password" | "number";
}> = [
  { key: "openrouter_api", label: "OpenRouter API Key", type: "password" },
  { key: "evermemos_api", label: "Evermemos API Key", type: "password" },
  { key: "mongo_user", label: "Mongo User" },
  { key: "mongo_password", label: "Mongo Password", type: "password" },
  { key: "default_model", label: "Default Model" },
  { key: "planning_model", label: "Planning Model" },
  { key: "scoring_model", label: "Scoring Model" },
  { key: "llm_base_url", label: "LLM Base URL" },
  { key: "evermemos_base_url", label: "Evermemos Base URL" },
  { key: "mongo_db_name", label: "Mongo Database Name" },
  { key: "frontend_origin", label: "Frontend Origin" },
  { key: "max_tool_rounds", label: "Max Tool Rounds", type: "number" },
  {
    key: "compaction_threshold",
    label: "Compaction Threshold",
    type: "number",
  },
];

const CONFIG_SECTIONS: Array<{
  title: string;
  description: string;
  fields: typeof CONFIG_FIELDS;
}> = [
  {
    title: "API Keys",
    description: "Credentials for your LLM, Evermemos, and Mongo integrations.",
    fields: [
      CONFIG_FIELDS[0],
      CONFIG_FIELDS[1],
      CONFIG_FIELDS[2],
      CONFIG_FIELDS[3],
    ],
  },
  {
    title: "Models",
    description:
      "Pick which models power default, planning, and scoring flows.",
    fields: [CONFIG_FIELDS[4], CONFIG_FIELDS[5], CONFIG_FIELDS[6]],
  },
  {
    title: "Infrastructure",
    description: "Base URLs and database settings used by the backend.",
    fields: [
      CONFIG_FIELDS[7],
      CONFIG_FIELDS[8],
      CONFIG_FIELDS[9],
      CONFIG_FIELDS[10],
    ],
  },
  {
    title: "Runtime",
    description: "Tune tool execution depth and compaction behavior.",
    fields: [CONFIG_FIELDS[11], CONFIG_FIELDS[12]],
  },
];

const MODEL_FIELD_KEYS = new Set<keyof AppConfig>([
  "default_model",
  "planning_model",
  "scoring_model",
]);

type ModelOption = {
  value: string;
  label: string;
  name: string;
  contextLength: number | null;
};

function configToFormValues(config: AppConfig): ConfigFormValues {
  return {
    openrouter_api: config.openrouter_api,
    evermemos_api: config.evermemos_api,
    mongo_user: config.mongo_user,
    mongo_password: config.mongo_password,
    default_model: config.default_model,
    planning_model: config.planning_model,
    scoring_model: config.scoring_model,
    llm_base_url: config.llm_base_url,
    evermemos_base_url: config.evermemos_base_url,
    mongo_db_name: config.mongo_db_name,
    frontend_origin: config.frontend_origin,
    max_tool_rounds: String(config.max_tool_rounds),
    compaction_threshold: String(config.compaction_threshold),
  };
}

function toModelOption(model: {
  id: string;
  name: string;
  context_length: number | null;
}): ModelOption {
  return {
    value: model.id,
    label: model.id,
    name: model.name,
    contextLength: model.context_length,
  };
}

function getModelOption(
  options: ModelOption[],
  value: string,
): ModelOption | null {
  if (!value) return null;

  const existing = options.find((option) => option.value === value);
  if (existing) return existing;

  return {
    value,
    label: value,
    name: "Custom value",
    contextLength: null,
  };
}

const modelSelectClassNames = {
  control: (state: { isFocused: boolean; isDisabled: boolean }) =>
    cn(
      "min-h-8 rounded-[var(--radius)] border-2 border-border bg-background px-0.5 py-0 text-sm shadow-xs transition-colors",
      state.isFocused && "border-ring ring-2 ring-ring",
      state.isDisabled && "cursor-not-allowed opacity-50",
    ),
  input: () => "m-0 p-0 text-sm text-foreground",
  valueContainer: () => "px-2 py-0",
  placeholder: () => "text-sm text-muted-foreground",
  singleValue: () => "text-sm text-foreground",
  menu: () =>
    "mt-1 overflow-hidden rounded-[var(--radius)] border-2 border-border bg-popover text-popover-foreground shadow-md",
  menuList: () => "p-1",
  option: (state: { isFocused: boolean; isSelected: boolean }) =>
    cn(
      "cursor-pointer rounded-[var(--radius)] px-2 py-1.5 text-sm",
      state.isFocused && "bg-accent text-accent-foreground",
      state.isSelected && "bg-accent text-accent-foreground",
    ),
  noOptionsMessage: () => "px-2 py-2 text-sm text-muted-foreground",
  dropdownIndicator: () => "px-2 text-muted-foreground",
  clearIndicator: () => "px-2 text-muted-foreground",
  indicatorsContainer: () => "self-stretch",
} as const;

export function Settings() {
  const { theme, setTheme } = useTheme();
  const {
    activeTheme,
    setTheme: setThemePersonality,
    themes,
  } = useThemePersonality();
  const [open, setOpen] = useState(false);
  const { data: config, isLoading, isError } = useConfig();
  const { data: modelData, isLoading: isModelsLoading } = useOpenRouterModels();
  const updateConfigMutation = useUpdateConfig();
  const [draftValues, setDraftValues] = useState<Partial<ConfigFormValues>>({});
  const modelOptions = (modelData?.models ?? []).map(toModelOption);

  const formValues = config
    ? { ...configToFormValues(config), ...draftValues }
    : null;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setDraftValues({});
    }
  };

  const handleChange = (key: keyof AppConfig, value: string) => {
    setDraftValues((current) => {
      if (key !== "default_model" || !formValues) {
        return { ...current, [key]: value };
      }

      const nextValues: Partial<ConfigFormValues> = {
        ...current,
        default_model: value,
      };

      if (formValues.planning_model === formValues.default_model) {
        nextValues.planning_model = value;
      }

      if (formValues.scoring_model === formValues.default_model) {
        nextValues.scoring_model = value;
      }

      return nextValues;
    });
  };

  const handleSubmit: React.ComponentProps<"form">["onSubmit"] = async (
    event,
  ) => {
    event.preventDefault();

    if (!formValues) return;

    const maxToolRounds = Number(formValues.max_tool_rounds);
    const compactionThreshold = Number(formValues.compaction_threshold);

    if (Number.isNaN(maxToolRounds) || Number.isNaN(compactionThreshold)) {
      toast.error("Numeric settings must contain valid numbers.");
      return;
    }

    try {
      await updateConfigMutation.mutateAsync({
        openrouter_api: formValues.openrouter_api,
        evermemos_api: formValues.evermemos_api,
        mongo_user: formValues.mongo_user,
        mongo_password: formValues.mongo_password,
        default_model: formValues.default_model,
        planning_model: formValues.planning_model,
        scoring_model: formValues.scoring_model,
        llm_base_url: formValues.llm_base_url,
        evermemos_base_url: formValues.evermemos_base_url,
        mongo_db_name: formValues.mongo_db_name,
        frontend_origin: formValues.frontend_origin,
        max_tool_rounds: maxToolRounds,
        compaction_threshold: compactionThreshold,
      });
      toast.success("Settings updated.");
      setDraftValues({});
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update settings.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "w-full justify-start gap-2",
            })}
          />
        }
      >
        Settings
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>App Settings</DialogTitle>
          <DialogDescription>
            Update the backend configuration stored in `backend/config.json`.
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-4 rounded-lg border-2 border-border bg-muted/30 p-4">
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold">Appearance</h3>
            <p className="text-sm text-muted-foreground">
              Control the app color mode and visual personality.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="theme-mode">Theme Mode</Label>
              <Select
                value={theme ?? "system"}
                onValueChange={(value) => {
                  if (value) {
                    setTheme(value);
                  }
                }}
              >
                <SelectTrigger id="theme-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="theme-personality">Theme Personality</Label>
              <Select
                value={activeTheme.id}
                onValueChange={(value) => {
                  if (value) {
                    setThemePersonality(value);
                  }
                }}
              >
                <SelectTrigger id="theme-personality" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((personality) => (
                    <SelectItem key={personality.id} value={personality.id}>
                      {personality.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        )}
        {isError && (
          <p className="text-sm text-destructive">
            Failed to load the current settings.
          </p>
        )}

        {formValues && (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {CONFIG_SECTIONS.map((section) => (
              <section
                key={section.title}
                className="grid gap-4 rounded-lg border-2 border-border p-4"
              >
                <div className="grid gap-1">
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {section.fields.map(({ key, label, type = "text" }) => (
                    <div key={key} className="grid gap-2">
                      <Label htmlFor={key}>{label}</Label>
                      {type === "text" && MODEL_FIELD_KEYS.has(key) ? (
                        <>
                          <CreatableSelect<ModelOption, false>
                            inputId={key}
                            isClearable
                            options={modelOptions}
                            value={getModelOption(
                              modelOptions,
                              formValues[key],
                            )}
                            onChange={(option) => {
                              handleChange(key, option?.value ?? "");
                            }}
                            placeholder={
                              isModelsLoading
                                ? "Loading OpenRouter models..."
                                : "Type or select an OpenRouter model"
                            }
                            noOptionsMessage={() =>
                              "No OpenRouter models found."
                            }
                            formatCreateLabel={(inputValue) =>
                              `Use "${inputValue}"`
                            }
                            formatOptionLabel={(option) => (
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate">{option.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {option.contextLength
                                    ? `${option.name} · ${option.contextLength.toLocaleString()} ctx`
                                    : option.name}
                                </span>
                              </div>
                            )}
                            classNames={modelSelectClassNames}
                            unstyled
                          />
                          <p className="text-xs text-muted-foreground">
                            Type any model id or pick one from the dropdown.
                            Save will validate it against OpenRouter.
                          </p>
                        </>
                      ) : (
                        <Input
                          id={key}
                          type={type}
                          step={type === "number" ? "any" : undefined}
                          value={formValues[key]}
                          onChange={(event) =>
                            handleChange(key, event.target.value)
                          }
                          autoComplete="off"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={updateConfigMutation.isPending}>
                {updateConfigMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

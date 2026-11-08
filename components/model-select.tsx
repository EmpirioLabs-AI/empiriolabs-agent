"use client";

import { useMemo, type Ref } from "react";
import type { ChatModel } from "@/lib/types";
import { ChevronDownIcon } from "./icons";

type ModelSelectProps = {
  models: ChatModel[];
  value: string | null;
  /** Labels the models that answer without tools. */
  markChatOnly?: boolean;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  ref?: Ref<HTMLSelectElement>;
};

/** A native select, grouped by each model's author, in catalog order. */
export function ModelSelect({ models, value, markChatOnly, onChange, disabled, ref }: ModelSelectProps) {
  const groups = useMemo(() => {
    const byAuthor = new Map<string, ChatModel[]>();
    for (const model of models) {
      const group = byAuthor.get(model.author);
      if (group) group.push(model);
      else byAuthor.set(model.author, [model]);
    }
    return [...byAuthor];
  }, [models]);

  return (
    <div className="model-select">
      <label className="visually-hidden" htmlFor="model-select">
        Model
      </label>
      <select
        ref={ref}
        id="model-select"
        name="model"
        className="model-select__control"
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled || models.length === 0}
      >
        {models.length === 0 ? (
          <option value="">No models available</option>
        ) : (
          groups.map(([author, items]) => (
            <optgroup key={author || "other"} label={author || "Other"}>
              {items.map((model) => (
                <option key={model.id} value={model.id}>
                  {markChatOnly && !model.tools ? `${model.name} (chat only)` : model.name}
                </option>
              ))}
            </optgroup>
          ))
        )}
      </select>
      <ChevronDownIcon className="model-select__chevron" width={14} height={14} />
    </div>
  );
}

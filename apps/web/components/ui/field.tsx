import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import styles from "./field.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

function Required() {
  return (
    <span className={styles.required} aria-hidden="true">
      {" "}
      *
    </span>
  );
}

// Label + required marker + error wrapper around a single control. `children`
// may be a render function receiving the generated id, so the label's htmlFor
// and the control's id always match.
type FieldProps = {
  label: ReactNode;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode | ((id: string) => ReactNode);
};

export function Field({ label, required, error, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <Required />}
      </label>
      {typeof children === "function" ? children(id) : children}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(styles.input, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cx(styles.select, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(styles.textarea, className)} {...rest} />;
});

// Single-select radio group rendered as segmented chips. The native radios are
// visually hidden but keep keyboard + a11y semantics.
type ChoiceChipsProps<T extends string> = {
  legend: ReactNode;
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  renderOption: (option: T) => ReactNode;
  name?: string;
  required?: boolean;
  hint?: ReactNode;
  // When set, a "clear" button appears once a value is chosen.
  onClear?: () => void;
  clearLabel?: ReactNode;
};

export function ChoiceChips<T extends string>({
  legend,
  options,
  value,
  onChange,
  renderOption,
  name,
  required,
  hint,
  onClear,
  clearLabel,
}: ChoiceChipsProps<T>) {
  const groupName = useId();
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.label}>
        {legend}
        {required && <Required />}
      </legend>
      <div className={styles.chips}>
        {options.map((option) => (
          <label
            key={option}
            className={cx(styles.chip, value === option && styles.chipActive)}
          >
            <input
              type="radio"
              name={name ?? groupName}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className={styles.srOnly}
            />
            {renderOption(option)}
          </label>
        ))}
        {onClear && value && (
          <button type="button" className={styles.clear} onClick={onClear}>
            {clearLabel}
          </button>
        )}
      </div>
      {hint}
    </fieldset>
  );
}

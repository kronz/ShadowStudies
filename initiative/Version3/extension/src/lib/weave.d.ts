namespace JSX {
  interface IntrinsicElements {
    "weave-button": JSX.HTMLAttributes<HTMLElement> & {
      type?: "button" | "submit" | "reset";
      variant?: "outlined" | "flat" | "solid";
      density?: "high" | "medium";
      iconposition?: "left" | "right";
      disabled?: boolean;
    };
    "weave-select": JSX.HTMLAttributes<HTMLElement> & {
      placeholder?: any;
      value: any;
      children: JSX.Element[];
      onChange: (e: CustomEvent<{ value: string; text: string }>) => void;
    };
    "weave-select-option": JSX.HTMLAttributes<HTMLElement> & {
      disabled?: true;
      value: any;
      children?: JSX.Element | string;
    };
    "weave-accordion": JSX.HTMLAttributes<HTMLElement> & {
      label?: string;
      expanded?: boolean;
      disabled?: boolean;
      indicator?: "caret" | "plusminus";
      indicatorposition?: "left" | "right";
      children?: any;
    };
    "weave-checkbox": {
      onChange?: (e: CustomEvent) => void;
      children?: JSX.Element | string;
      style?: string;
      checked: boolean;
      showlabel?: boolean;
      label?: string;
      value?: string;
      key?: string;
      disabled?: boolean;
    };
  }
}

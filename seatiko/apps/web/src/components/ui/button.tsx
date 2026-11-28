"use client";

import Link, { type LinkProps } from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "link"
  | "danger-outline"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

export type ButtonClassOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: boolean;
  shimmer?: boolean;
  loading?: boolean;
  className?: string;
};

/** Build the unified Seatiko button class string for <button>, <Link>, or <a>. */
export function buttonClassName({
  variant = "primary",
  size = "md",
  block = false,
  icon = false,
  shimmer = false,
  loading = false,
  className,
}: ButtonClassOptions = {}): string {
  const classes = ["btn", `btn--${variant}`];
  if (variant !== "link") {
    classes.push(`btn--${size}`);
  }
  if (icon) classes.push("btn--icon");
  if (block && !icon) classes.push("btn--block");
  if (shimmer && variant === "primary") classes.push("btn--shimmer");
  if (loading) classes.push("is-loading");
  if (className) classes.push(className);
  return classes.join(" ");
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  type?: "button" | "submit" | "reset";
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  shimmer?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

/** Unified Seatiko button primitive with width-preserving loading spinner. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    type = "button",
    variant = "primary",
    size = "md",
    block = false,
    shimmer = false,
    loading = false,
    disabled = false,
    leftIcon,
    rightIcon,
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const isBlocked = disabled || loading;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (isBlocked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={isBlocked}
      aria-busy={loading ? true : undefined}
      data-loading={loading ? "true" : undefined}
      className={buttonClassName({
        variant,
        size,
        block,
        shimmer,
        loading,
        className,
      })}
      onClick={handleClick}
      {...rest}
    >
      <span className="btn-content">
        {leftIcon}
        {children}
        {rightIcon}
      </span>
    </button>
  );
});

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label" | "type"
> & {
  type?: "button" | "submit" | "reset";
  /** Required accessible name for icon-only actions. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

/** Square icon-only button requiring an accessible label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      type = "button",
      label,
      title,
      icon,
      variant = "ghost",
      size = "md",
      loading = false,
      disabled = false,
      className,
      onClick,
      ...rest
    },
    ref,
  ) {
    const isBlocked = disabled || loading;

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      if (isBlocked) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={title ?? label}
        disabled={isBlocked}
        aria-busy={loading ? true : undefined}
        data-loading={loading ? "true" : undefined}
        className={buttonClassName({
          variant,
          size,
          icon: true,
          loading,
          className,
        })}
        onClick={handleClick}
        {...rest}
      >
        <span className="btn-content">{icon}</span>
      </button>
    );
  },
);

export type ButtonLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    icon?: boolean;
    shimmer?: boolean;
    loading?: boolean;
    disabled?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  };

/** Next.js Link styled with unified button classes and disabled/loading guards. */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    {
      variant = "primary",
      size = "md",
      block = false,
      icon = false,
      shimmer = false,
      loading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      className,
      children,
      tabIndex,
      onClick,
      ...rest
    },
    ref,
  ) {
    const isBlocked = disabled || loading;

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (isBlocked) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <Link
        ref={ref}
        aria-disabled={isBlocked ? true : undefined}
        aria-busy={loading ? true : undefined}
        data-loading={loading ? "true" : undefined}
        tabIndex={isBlocked ? -1 : tabIndex}
        className={buttonClassName({
          variant,
          size,
          block,
          icon,
          shimmer,
          loading,
          className,
        })}
        onClick={handleClick}
        {...rest}
      >
        <span className="btn-content">
          {leftIcon}
          {children}
          {rightIcon}
        </span>
      </Link>
    );
  },
);

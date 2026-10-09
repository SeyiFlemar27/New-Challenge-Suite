import Image, { type ImageProps } from "next/image";

type ContentImageProps = Omit<ImageProps, "width" | "height"> & {
  width?: number;
  height?: number;
};

/**
 * Renders user-provided and dynamic media without requiring broad remote-host
 * allowances. Explicit CSS sizing remains responsible for each existing layout.
 */
export function ContentImage({ width = 1200, height = 800, alt, ...props }: ContentImageProps) {
  return <Image {...props} alt={alt} width={width} height={height} unoptimized />;
}

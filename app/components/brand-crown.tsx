type BrandCrownProps = {
  size?: number;
};

export function BrandCrown({ size = 24 }: BrandCrownProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 6l5.5 5.5L12 3l4.5 8.5L22 6l-3 11H5L2 6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <path d="M5 20h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
    </svg>
  );
}

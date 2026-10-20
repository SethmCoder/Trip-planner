export default function Logo({ size = 40 }: { size?: number }) {
  // Simple gray airplane: rounded-nose fuselage, main wings, tail fin + stabilizers (top view)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="#808080" aria-label="The Travel Log logo" role="img">
      <path d="M50 4 C56 4 60 12 60 26 L60 38 L88 62 L88 74 L60 60 L60 78 L68 86 L68 92 L50 89 L32 92 L32 86 L40 78 L40 60 L12 74 L12 62 L40 38 L40 26 C40 12 44 4 50 4 Z" />
    </svg>
  )
}

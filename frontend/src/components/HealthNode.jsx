export default function HealthNode() {
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 64]} />

      <meshStandardMaterial
        color="#22D3EE"
        emissive="#22D3EE"
        emissiveIntensity={1.5}
        roughness={0.3}
        metalness={0.2}
      />
    </mesh>
  );
}
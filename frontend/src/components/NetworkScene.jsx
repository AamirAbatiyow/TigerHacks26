import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Line,
  Text,
  Stars,
} from "@react-three/drei";

const nodes = [
  {
    id: "analytics",
    name: "Analytics Provider",
    position: [2.8, 1.4, -0.5],
    color: "#8B5CF6",
    category: "Analytics",
    fields: ["symptom", "session_id", "device_id"],
    method: "POST",
    endpoint: "/collect",
  },
  {
    id: "advertising",
    name: "Ad Network",
    position: [-3.1, 1.6, -0.8],
    color: "#EC4899",
    category: "Advertising",
    fields: ["session_id", "page_view"],
    method: "POST",
    endpoint: "/events",
  },
  {
    id: "metrics",
    name: "Metrics API",
    position: [3.2, -1.2, 0.4],
    color: "#2DD4BF",
    category: "API",
    fields: ["medication", "timestamp"],
    method: "POST",
    endpoint: "/metrics",
  },
  {
    id: "auth",
    name: "Authentication",
    position: [-2.8, -1.7, 0.5],
    color: "#22D3EE",
    category: "First party",
    fields: ["user_id", "session_token"],
    method: "POST",
    endpoint: "/auth/session",
  },
  {
    id: "unknown",
    name: "Unknown Service",
    position: [0.4, 2.7, -1.1],
    color: "#FBBF24",
    category: "Unknown",
    fields: ["device_id"],
    method: "GET",
    endpoint: "/pixel",
  },
  {
    id: "logging",
    name: "Logging Service",
    position: [-0.6, -2.7, -0.8],
    color: "#8B5CF6",
    category: "Analytics",
    fields: ["error_event", "browser"],
    method: "POST",
    endpoint: "/log",
  },
  {
    id: "cdn",
    name: "CDN",
    position: [4.1, 0.1, -1.8],
    color: "#22D3EE",
    category: "First party",
    fields: ["asset_request"],
    method: "GET",
    endpoint: "/assets",
  },
  {
    id: "tracker2",
    name: "Tracking Pixel",
    position: [-4, 0, -1.6],
    color: "#EC4899",
    category: "Advertising",
    fields: ["page_view", "browser_id"],
    method: "GET",
    endpoint: "/track",
  },
  {
    id: "api2",
    name: "Health API",
    position: [1.5, -2.7, -1.3],
    color: "#2DD4BF",
    category: "API",
    fields: ["symptom"],
    method: "POST",
    endpoint: "/health/events",
  },
  {
    id: "analytics2",
    name: "Session Analytics",
    position: [-1.7, 2.5, -1.3],
    color: "#8B5CF6",
    category: "Analytics",
    fields: ["click_event", "session_id"],
    method: "POST",
    endpoint: "/session",
  },
];

function ServiceNode({ node, onSelectNode }) {
  return (
    <group position={node.position}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode(node);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[0.22, 32, 32]} />

        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.65}
          roughness={0.35}
        />
      </mesh>

      <Text
        position={[0, -0.42, 0]}
        fontSize={0.14}
        color="#CBD5E1"
        anchorX="center"
        anchorY="middle"
      >
        {node.name}
      </Text>
    </group>
  );
}

function CenterNode() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.62, 48, 48]} />

        <meshStandardMaterial
          color="#22D3EE"
          emissive="#22D3EE"
          emissiveIntensity={0.7}
          roughness={0.3}
        />
      </mesh>

      <Text
        position={[0, -0.9, 0]}
        fontSize={0.18}
        color="#F8FAFC"
        anchorX="center"
      >
        MyHealth App
      </Text>
    </group>
  );
}

function Scene({ onSelectNode }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 5, 6]} intensity={8} />

      <Stars
        radius={35}
        depth={20}
        count={500}
        factor={1}
        saturation={0}
        fade
        speed={0.1}
      />

      <CenterNode />

      {nodes.map((node) => (
        <group key={node.id}>
          <Line
            points={[[0, 0, 0], node.position]}
            color={node.color}
            lineWidth={0.7}
            transparent
            opacity={0.35}
          />

          <ServiceNode
            node={node}
            onSelectNode={onSelectNode}
          />
        </group>
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={11}
        autoRotate
        autoRotateSpeed={0.12}
      />
    </>
  );
}

export default function NetworkScene({ onSelectNode }) {
  return (
    <Canvas
      camera={{
        position: [0, 0, 8],
        fov: 45,
      }}
      onPointerMissed={() => onSelectNode(null)}
    >
      <Scene onSelectNode={onSelectNode} />
    </Canvas>
  );
}
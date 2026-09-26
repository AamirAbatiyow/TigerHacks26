import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Canvas,
  useFrame,
  useThree,
} from "@react-three/fiber";

import {
  Billboard,
  OrbitControls,
  QuadraticBezierLine,
  Stars,
  Text,
} from "@react-three/drei";

import * as THREE from "three";

function ResponsiveCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    const aspect = size.width / size.height;

    let distance = 8.5;

    if (aspect > 1.8) {
      distance = 10.5;
    } else if (aspect > 1.4) {
      distance = 9.4;
    }

    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}

function getCurve(node) {
  const start =
    new THREE.Vector3(0, 0, 0);

  const midpoint =
    new THREE.Vector3(
      node.position[0] * 0.5,
      node.position[1] * 0.5 + 0.25,
      node.position[2] * 0.45 + 0.4
    );

  const end =
    new THREE.Vector3(
      ...node.position
    );

  return new THREE.QuadraticBezierCurve3(
    start,
    midpoint,
    end
  );
}

function FlowParticle({
  node,
  offset,
  active,
}) {
  const ref = useRef();

  const curve = useMemo(
    () => getCurve(node),
    [node]
  );

  useFrame(({ clock }) => {
    if (!ref.current) return;

    const speed =
      active && node.sensitive
        ? 0.22
        : 0.13;

    const progress =
      (clock.getElapsedTime() * speed + offset) % 1;

    ref.current.position.copy(
      curve.getPoint(progress)
    );
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry
        args={[
          active ? 0.04 : 0.025,
          10,
          10,
        ]}
      />

      <meshBasicMaterial
        color={
          active && node.sensitive
            ? "#FB4D6D"
            : node.color
        }
        transparent
        opacity={active ? 1 : 0.75}
      />
    </mesh>
  );
}

function SelectionRing({ color }) {
  const ref = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;

    ref.current.rotation.y =
      clock.getElapsedTime() * 0.3;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry
        args={[0.19, 24, 24]}
      />

      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={0.45}
      />
    </mesh>
  );
}

function ServiceNode({
  node,
  selectedNode,
  activeNodeId,
  onSelectNode,
}) {
  const meshRef = useRef();
  const [hovered, setHovered] =
    useState(false);

  const isSelected =
    selectedNode?.id === node.id;

  const isActive =
    activeNodeId === node.id;

  const anotherSelected =
    selectedNode &&
    selectedNode.id !== node.id;

  useFrame(() => {
    if (!meshRef.current) return;

    let targetScale = 1;

    if (hovered) {
      targetScale = 1.1;
    }

    if (isSelected) {
      targetScale = 1.16;
    }

    if (isActive) {
      targetScale = 1.12;
    }

    meshRef.current.scale.lerp(
      new THREE.Vector3(
        targetScale,
        targetScale,
        targetScale
      ),
      0.1
    );
  });

  return (
    <group position={node.position}>
      {isSelected && (
        <SelectionRing
          color={node.color}
        />
      )}

      <mesh
        ref={meshRef}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode(node);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor =
            "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor =
            "default";
        }}
      >
        <sphereGeometry
          args={[0.14, 28, 28]}
        />

        <meshStandardMaterial
          color={
            isActive &&
            node.sensitive
              ? "#FB4D6D"
              : node.color
          }
          emissive={
            isActive &&
            node.sensitive
              ? "#FB4D6D"
              : node.color
          }
          emissiveIntensity={
            isActive
              ? 1.5
              : isSelected
              ? 1.1
              : hovered
              ? 0.8
              : 0.35
          }
          transparent
          opacity={
            anotherSelected
              ? 0.25
              : 1
          }
          roughness={0.35}
          metalness={0.05}
        />
      </mesh>

      <Billboard>
        <Text
          position={[0, -0.28, 0]}
          fontSize={0.085}
          color={
            anotherSelected
              ? "#475569"
              : isSelected ||
                hovered ||
                isActive
              ? "#FFFFFF"
              : "#AAB8CC"
          }
          anchorX="center"
          anchorY="middle"
        >
          {node.name}
        </Text>

        {isActive &&
          node.sensitive && (
            <Text
              position={[0, 0.3, 0]}
              fontSize={0.06}
              color="#FB4D6D"
              anchorX="center"
            >
              SENSITIVE
            </Text>
          )}
      </Billboard>
    </group>
  );
}

function CenterNode() {
  const ref = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;

    const pulse =
      1 +
      Math.sin(
        clock.getElapsedTime() * 1.7
      ) *
        0.012;

    ref.current.scale.setScalar(
      pulse
    );
  });

  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry
          args={[0.36, 40, 40]}
        />

        <meshStandardMaterial
          color="#22D3EE"
          emissive="#22D3EE"
          emissiveIntensity={0.65}
          roughness={0.3}
        />
      </mesh>

      <Billboard>
        <Text
          position={[0, -0.56, 0]}
          fontSize={0.105}
          color="#F8FAFC"
          anchorX="center"
          anchorY="middle"
        >
          MyHealth App
        </Text>
      </Billboard>
    </group>
  );
}

function Connection({
  node,
  selectedNode,
  activeNodeId,
  onSelectNode,
}) {
  const isSelected =
    selectedNode?.id === node.id;

  const isActive =
    activeNodeId === node.id;

  const anotherSelected =
    selectedNode &&
    selectedNode.id !== node.id;

  const midpoint = [
    node.position[0] * 0.5,
    node.position[1] * 0.5 + 0.25,
    node.position[2] * 0.45 + 0.4,
  ];

  let lineColor =
    node.color;

  if (
    isActive &&
    node.sensitive
  ) {
    lineColor = "#FB4D6D";
  }

  let opacity = 0.16;
  let width = 0.4;

  if (anotherSelected) {
    opacity = 0.04;
  }

  if (isSelected) {
    opacity = 0.8;
    width = 1.25;
  }

  if (isActive) {
    opacity = 0.95;
    width = node.sensitive
      ? 1.8
      : 1.15;
  }

  return (
    <>
      <QuadraticBezierLine
        start={[0, 0, 0]}
        end={node.position}
        mid={midpoint}
        color={lineColor}
        lineWidth={width}
        transparent
        opacity={opacity}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode(node);
        }}
      />

      {!anotherSelected && (
        <>
          <FlowParticle
            node={node}
            offset={0}
            active={isActive}
          />

          <FlowParticle
            node={node}
            offset={0.33}
            active={isActive}
          />

          <FlowParticle
            node={node}
            offset={0.66}
            active={isActive}
          />
        </>
      )}
    </>
  );
}

function Scene({
  nodes,
  selectedNode,
  activeNodeId,
  onSelectNode,
}) {
  return (
    <>
      <ResponsiveCamera />

      <ambientLight intensity={0.45} />

      <pointLight
        position={[4, 5, 6]}
        intensity={5}
      />

      <pointLight
        position={[-4, -2, 3]}
        intensity={1.5}
        color="#8B5CF6"
      />

      <Stars
        radius={45}
        depth={25}
        count={180}
        factor={0.6}
        saturation={0}
        fade
        speed={0.025}
      />

      <CenterNode />

      {nodes.map((node) => (
        <group key={node.id}>
          <Connection
            node={node}
            selectedNode={selectedNode}
            activeNodeId={activeNodeId}
            onSelectNode={onSelectNode}
          />

          <ServiceNode
            node={node}
            selectedNode={selectedNode}
            activeNodeId={activeNodeId}
            onSelectNode={onSelectNode}
          />
        </group>
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={7}
        maxDistance={16}
        zoomSpeed={0.55}
        autoRotate={!selectedNode}
        autoRotateSpeed={0.035}
        enableDamping
        dampingFactor={0.06}
      />
    </>
  );
}

export default function NetworkScene({
  nodes,
  selectedNode,
  activeNodeId,
  onSelectNode,
}) {
  return (
    <Canvas
      camera={{
        position: [0, 0, 9],
        fov: 40,
        near: 0.1,
        far: 100,
      }}
      dpr={[1, 2]}
      onPointerMissed={() =>
        onSelectNode(null)
      }
    >
      <Scene
        nodes={nodes}
        selectedNode={selectedNode}
        activeNodeId={activeNodeId}
        onSelectNode={onSelectNode}
      />
    </Canvas>
  );
}
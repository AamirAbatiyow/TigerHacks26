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
  Html,
  OrbitControls,
  QuadraticBezierLine,
  Stars,
} from "@react-three/drei";

import * as THREE from "three";

const requestOffsets = [
  [1.55, 0.35, 0.1],
  [-1.4, 0.8, -0.2],
  [0.5, 1.45, 0.2],
  [-0.7, -1.4, 0.25],
  [1.25, -1.05, -0.25],
  [-1.55, -0.45, -0.1],
];

function ResponsiveCamera({
  drillService,
  controlsRef,
}) {
  const { size } = useThree();

  const targetZ = useRef(9);
  const transitioning = useRef(true);

  useEffect(() => {
    const aspect =
      size.width / size.height;

    if (drillService) {
      targetZ.current = 6.2;
    } else if (aspect > 1.8) {
      targetZ.current = 10.5;
    } else if (aspect > 1.4) {
      targetZ.current = 9.4;
    } else {
      targetZ.current = 8.5;
    }

    transitioning.current = true;
  }, [
    drillService,
    size.width,
    size.height,
  ]);

  useFrame(({ camera }) => {
    if (!transitioning.current) {
      return;
    }

    camera.position.z =
      THREE.MathUtils.lerp(
        camera.position.z,
        targetZ.current,
        0.07
      );

    if (controlsRef.current) {
      controlsRef.current.target.lerp(
        new THREE.Vector3(0, 0, 0),
        0.08
      );

      controlsRef.current.update();
    }

    if (
      Math.abs(
        camera.position.z -
          targetZ.current
      ) < 0.03
    ) {
      camera.position.z =
        targetZ.current;

      transitioning.current =
        false;
    }

    camera.updateProjectionMatrix();
  });

  return null;
}

function GlowSphere({
  color,
  radius,
  opacity,
}) {
  return (
    <mesh>
      <sphereGeometry
        args={[radius, 32, 32]}
      />

      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={
          THREE.AdditiveBlending
        }
      />
    </mesh>
  );
}

function getServiceCurve(node) {
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),

    new THREE.Vector3(
      node.position[0] * 0.5,
      node.position[1] * 0.5 + 0.25,
      node.position[2] * 0.45 + 0.4
    ),

    new THREE.Vector3(
      ...node.position
    )
  );
}

function ServiceParticle({
  node,
  offset,
  active,
}) {
  const ref = useRef();

  const curve = useMemo(
    () => getServiceCurve(node),
    [node]
  );

  useFrame(({ clock }) => {
    if (!ref.current) {
      return;
    }

    const speed =
      active && node.sensitive
        ? 0.22
        : 0.13;

    const t =
      (clock.getElapsedTime() *
        speed +
        offset) %
      1;

    ref.current.position.copy(
      curve.getPoint(t)
    );
  });

  const color =
    active && node.sensitive
      ? "#FB4D6D"
      : node.color;

  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry
          args={[
            0.025,
            10,
            10,
          ]}
        />

        <meshBasicMaterial
          color={color}
        />
      </mesh>

      <GlowSphere
        color={color}
        radius={0.055}
        opacity={0.16}
      />
    </group>
  );
}

function ServiceNode({
  node,
  drillService,
  activeNodeId,
  onEnterService,
}) {
  const [hovered, setHovered] =
    useState(false);

  const isDrilled =
    drillService?.id === node.id;

  const anotherDrilled =
    drillService && !isDrilled;

  const active =
    activeNodeId === node.id;

  const color =
    active && node.sensitive
      ? "#FB4D6D"
      : node.color;

  return (
    <group position={node.position}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();

          onEnterService(node);
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
          args={[
            isDrilled
              ? 0.2
              : 0.14,
            48,
            48,
          ]}
        />

        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={
            active
              ? 1.4
              : hovered ||
                isDrilled
              ? 0.95
              : 0.55
          }
          roughness={0.18}
          metalness={0.12}
          clearcoat={1}
          clearcoatRoughness={
            0.12
          }
          transparent
          opacity={
            anotherDrilled
              ? 0.08
              : 1
          }
        />
      </mesh>

      {!anotherDrilled && (
        <>
          <GlowSphere
            color={color}
            radius={
              isDrilled
                ? 0.27
                : 0.19
            }
            opacity={
              active
                ? 0.28
                : 0.13
            }
          />

          <GlowSphere
            color={color}
            radius={
              isDrilled
                ? 0.34
                : 0.23
            }
            opacity={0.06}
          />
        </>
      )}

      <Html
        position={[
          0,
          isDrilled
            ? -0.38
            : -0.29,
          0,
        ]}
        center
        transform
        distanceFactor={7}
        style={{
          pointerEvents: "none",
          whiteSpace: "nowrap",
          color: anotherDrilled
            ? "#334155"
            : "#E2E8F0",
          fontSize: isDrilled
            ? "12px"
            : "10px",
          fontWeight: 500,
          textShadow:
            "0 1px 4px rgba(0,0,0,.8)",
        }}
      >
        {node.name}
      </Html>
    </group>
  );
}

function RequestParticle({
  start,
  end,
  color,
  offset,
}) {
  const ref = useRef();

  const curve = useMemo(() => {
    const a =
      new THREE.Vector3(
        ...start
      );

    const b =
      new THREE.Vector3(
        ...end
      );

    const midpoint =
      a.clone().lerp(b, 0.5);

    midpoint.z += 0.25;

    return new THREE.QuadraticBezierCurve3(
      a,
      midpoint,
      b
    );
  }, [start, end]);

  useFrame(({ clock }) => {
    if (!ref.current) {
      return;
    }

    const t =
      (clock.getElapsedTime() *
        0.2 +
        offset) %
      1;

    ref.current.position.copy(
      curve.getPoint(t)
    );
  });

  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry
          args={[
            0.025,
            8,
            8,
          ]}
        />

        <meshBasicMaterial
          color={color}
        />
      </mesh>

      <GlowSphere
        color={color}
        radius={0.055}
        opacity={0.18}
      />
    </group>
  );
}

function RequestNode({
  request,
  service,
  position,
  selectedRequest,
  onSelectRequest,
}) {
  const [hovered, setHovered] =
    useState(false);

  const ref = useRef();

  const selected =
    selectedRequest?.id ===
    request.id;

  useFrame(() => {
    if (!ref.current) {
      return;
    }

    const target =
      selected
        ? 1.2
        : hovered
        ? 1.1
        : 1;

    ref.current.scale.lerp(
      new THREE.Vector3(
        target,
        target,
        target
      ),
      0.1
    );
  });

  const color =
    request.sensitive
      ? "#FB4D6D"
      : service.color;

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onClick={(event) => {
          event.stopPropagation();

          onSelectRequest(request);
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
          args={[
            0.1,
            36,
            36,
          ]}
        />

        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={
            selected
              ? 1.3
              : hovered
              ? 1
              : 0.6
          }
          roughness={0.2}
          clearcoat={1}
          clearcoatRoughness={
            0.15
          }
        />
      </mesh>

      <GlowSphere
        color={color}
        radius={0.145}
        opacity={
          selected
            ? 0.26
            : 0.12
        }
      />

      <Html
        position={[
          0,
          -0.22,
          0,
        ]}
        center
        transform
        distanceFactor={7}
        style={{
          pointerEvents: "none",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: selected
              ? "#FFFFFF"
              : "#CBD5E1",
            fontSize: "9px",
            fontWeight: 500,
            textShadow:
              "0 1px 4px rgba(0,0,0,.8)",
          }}
        >
          {request.name}
        </div>

        <div
          style={{
            color: "#64748B",
            fontSize: "7px",
            marginTop: "2px",
          }}
        >
          {request.method}
        </div>
      </Html>
    </group>
  );
}

function DrillRequests({
  service,
  selectedRequest,
  onSelectRequest,
}) {
  if (!service) {
    return null;
  }

  return (
    <>
      {service.requests.map(
        (request, index) => {
          const offset =
            requestOffsets[
              index %
                requestOffsets.length
            ];

          const requestPosition = [
            service.position[0] +
              offset[0],

            service.position[1] +
              offset[1],

            service.position[2] +
              offset[2],
          ];

          const color =
            request.sensitive
              ? "#FB4D6D"
              : service.color;

          const midpoint = [
            (service.position[0] +
              requestPosition[0]) /
              2,

            (service.position[1] +
              requestPosition[1]) /
                2 +
              0.15,

            (service.position[2] +
              requestPosition[2]) /
                2 +
              0.2,
          ];

          return (
            <group
              key={request.id}
            >
              <QuadraticBezierLine
                start={
                  service.position
                }
                end={
                  requestPosition
                }
                mid={midpoint}
                color={color}
                lineWidth={
                  selectedRequest?.id ===
                  request.id
                    ? 1.5
                    : 0.65
                }
                transparent
                opacity={
                  selectedRequest &&
                  selectedRequest.id !==
                    request.id
                    ? 0.12
                    : 0.55
                }
              />

              <RequestParticle
                start={
                  service.position
                }
                end={
                  requestPosition
                }
                color={color}
                offset={0}
              />

              <RequestParticle
                start={
                  service.position
                }
                end={
                  requestPosition
                }
                color={color}
                offset={0.5}
              />

              <RequestNode
                request={request}
                service={service}
                position={
                  requestPosition
                }
                selectedRequest={
                  selectedRequest
                }
                onSelectRequest={
                  onSelectRequest
                }
              />
            </group>
          );
        }
      )}
    </>
  );
}

function CenterNode({
  drillService,
}) {
  if (drillService) {
    return null;
  }

  return (
    <group>
      <mesh>
        <sphereGeometry
          args={[
            0.36,
            64,
            64,
          ]}
        />

        <meshPhysicalMaterial
          color="#22D3EE"
          emissive="#22D3EE"
          emissiveIntensity={0.9}
          roughness={0.16}
          metalness={0.12}
          clearcoat={1}
          clearcoatRoughness={
            0.1
          }
        />
      </mesh>

      <GlowSphere
        color="#22D3EE"
        radius={0.46}
        opacity={0.18}
      />

      <GlowSphere
        color="#22D3EE"
        radius={0.58}
        opacity={0.08}
      />

      <Html
        position={[
          0,
          -0.58,
          0,
        ]}
        center
        transform
        distanceFactor={7}
        style={{
          pointerEvents: "none",
          whiteSpace: "nowrap",
          color: "#F8FAFC",
          fontSize: "11px",
          fontWeight: 600,
          textShadow:
            "0 1px 4px rgba(0,0,0,.8)",
        }}
      >
        MyHealth App
      </Html>
    </group>
  );
}

function GraphRoot({
  children,
  drillService,
}) {
  const ref = useRef();

  useFrame(() => {
    if (!ref.current) {
      return;
    }

    const target =
      drillService
        ? new THREE.Vector3(
            -drillService.position[0],
            -drillService.position[1],
            -drillService.position[2]
          )
        : new THREE.Vector3(
            0,
            0,
            0
          );

    ref.current.position.lerp(
      target,
      0.08
    );
  });

  return (
    <group ref={ref}>
      {children}
    </group>
  );
}

function Scene({
  nodes,
  selectedRequest,
  drillService,
  activeNodeId,
  onEnterService,
  onSelectRequest,
}) {
  const controlsRef =
    useRef();

  return (
    <>
      <ResponsiveCamera
        drillService={
          drillService
        }
        controlsRef={
          controlsRef
        }
      />

      <ambientLight
        intensity={0.22}
      />

      <directionalLight
        position={[5, 6, 8]}
        intensity={2.8}
      />

      <pointLight
        position={[-5, 2, 4]}
        intensity={3}
        color="#38BDF8"
      />

      <pointLight
        position={[4, -4, 2]}
        intensity={2.4}
        color="#A855F7"
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

      <GraphRoot
        drillService={
          drillService
        }
      >
        <CenterNode
          drillService={
            drillService
          }
        />

        {nodes.map((node) => (
          <group key={node.id}>
            {!drillService && (
              <>
                <QuadraticBezierLine
                  start={[
                    0,
                    0,
                    0,
                  ]}
                  end={node.position}
                  mid={[
                    node.position[0] *
                      0.5,

                    node.position[1] *
                        0.5 +
                      0.25,

                    node.position[2] *
                        0.45 +
                      0.4,
                  ]}
                  color={node.color}
                  lineWidth={
                    activeNodeId ===
                    node.id
                      ? 1.2
                      : 0.45
                  }
                  transparent
                  opacity={
                    activeNodeId ===
                    node.id
                      ? 0.85
                      : 0.18
                  }
                />

                <ServiceParticle
                  node={node}
                  offset={0}
                  active={
                    activeNodeId ===
                    node.id
                  }
                />

                <ServiceParticle
                  node={node}
                  offset={0.5}
                  active={
                    activeNodeId ===
                    node.id
                  }
                />
              </>
            )}

            <ServiceNode
              node={node}
              drillService={
                drillService
              }
              activeNodeId={
                activeNodeId
              }
              onEnterService={
                onEnterService
              }
            />
          </group>
        ))}

        <DrillRequests
          service={drillService}
          selectedRequest={
            selectedRequest
          }
          onSelectRequest={
            onSelectRequest
          }
        />
      </GraphRoot>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={
          drillService
            ? 4.5
            : 7
        }
        maxDistance={
          drillService
            ? 10
            : 16
        }
        zoomSpeed={0.55}
        autoRotate={!drillService}
        autoRotateSpeed={0.04}
        enableDamping
        dampingFactor={0.06}
      />
    </>
  );
}

export default function NetworkScene({
  nodes,
  selectedRequest,
  drillService,
  activeNodeId,
  onEnterService,
  onSelectRequest,
  onClear,
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
      gl={{
        antialias: true,

        toneMapping:
          THREE.ACESFilmicToneMapping,

        toneMappingExposure:
          1.15,
      }}
      onPointerMissed={onClear}
    >
      <Scene
        nodes={nodes}
        selectedRequest={
          selectedRequest
        }
        drillService={
          drillService
        }
        activeNodeId={
          activeNodeId
        }
        onEnterService={
          onEnterService
        }
        onSelectRequest={
          onSelectRequest
        }
      />
    </Canvas>
  );
}

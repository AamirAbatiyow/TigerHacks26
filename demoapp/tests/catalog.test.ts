import { test } from "node:test";
import assert from "node:assert/strict";
import { conditions, medications } from "../src/catalog";

test("every specific health concern has at least three medications", () => {
  const conditionIds = new Set(conditions.map((condition) => condition.id));
  const medicationIds = medications.map((medication) => medication.id);

  assert.equal(conditionIds.size, conditions.length);
  assert.equal(new Set(medicationIds).size, medicationIds.length);

  for (const condition of conditions) {
    const matches = medications.filter(
      (medication) => medication.condition === condition.id,
    );
    assert.ok(
      matches.length >= 3,
      `${condition.name} should have at least three medications`,
    );
  }

  for (const medication of medications) {
    assert.ok(
      conditionIds.has(
        medication.condition as (typeof conditions)[number]["id"],
      ),
      `${medication.name} has an unknown condition`,
    );
  }
});

import * as modifierService from "../services/modifier.service.js";

export async function listPublicModifiers(request, response) {
  response.status(200).json({
    ...await modifierService.listPublicModifiers(request.params.productId, request.params.groupId, request.query)
  });
}

export async function getPublicModifier(request, response) {
  response.status(200).json({
    data: await modifierService.getPublicModifier(
      request.params.productId,
      request.params.groupId,
      request.params.modifierId
    )
  });
}

export async function listAdminModifiers(request, response) {
  response.status(200).json(
    await modifierService.listAdminModifiers(request.params.productId, request.params.groupId, request.query)
  );
}

export async function getAdminModifier(request, response) {
  response.status(200).json({
    data: await modifierService.getAdminModifier(
      request.params.productId,
      request.params.groupId,
      request.params.modifierId
    )
  });
}

export async function createModifier(request, response) {
  const modifier = await modifierService.createModifier(
    request.params.productId,
    request.params.groupId,
    request.body
  );
  response.location(
    `${request.baseUrl}/${request.params.productId}/modifier-groups/${request.params.groupId}/modifiers/${modifier.id}`
  );
  response.status(201).json({ data: modifier });
}

export async function updateModifier(request, response) {
  response.status(200).json({
    data: await modifierService.updateModifier(
      request.params.productId,
      request.params.groupId,
      request.params.modifierId,
      request.body
    )
  });
}
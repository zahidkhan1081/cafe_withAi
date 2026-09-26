import * as groupService from "../services/modifier-group.service.js";

export async function listPublicGroups(request, response) {
  response.status(200).json({
    ...await groupService.listPublicGroups(request.params.productId, request.query)
  });
}

export async function getPublicGroup(request, response) {
  response.status(200).json({
    data: await groupService.getPublicGroup(request.params.productId, request.params.groupId)
  });
}

export async function listAdminGroups(request, response) {
  response.status(200).json(
    await groupService.listAdminGroups(request.params.productId, request.query)
  );
}

export async function getAdminGroup(request, response) {
  response.status(200).json({
    data: await groupService.getAdminGroup(request.params.productId, request.params.groupId)
  });
}

export async function createGroup(request, response) {
  const group = await groupService.createGroup(request.params.productId, request.body);
  response.location(`${request.baseUrl}/${request.params.productId}/modifier-groups/${group.id}`);
  response.status(201).json({ data: group });
}

export async function updateGroup(request, response) {
  response.status(200).json({
    data: await groupService.updateGroup(request.params.productId, request.params.groupId, request.body)
  });
}
ARG TWENTY_IMAGE_TAG=v2.63.0
FROM twentycrm/twenty:${TWENTY_IMAGE_TAG}

COPY skip-workspace-samples.cjs /tmp/seatiko-skip-workspace-samples.cjs
RUN node /tmp/seatiko-skip-workspace-samples.cjs

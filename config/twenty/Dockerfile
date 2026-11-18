ARG TWENTY_IMAGE_TAG=v2.57.1
FROM twentycrm/twenty:${TWENTY_IMAGE_TAG}

COPY skip-workspace-samples.cjs /tmp/seatiko-skip-workspace-samples.cjs
RUN node /tmp/seatiko-skip-workspace-samples.cjs

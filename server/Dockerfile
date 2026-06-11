FROM public.ecr.aws/lambda/python:3.12

COPY main.py ${LAMBDA_TASK_ROOT}/

RUN pip install boto3 pywebpush --quiet --no-cache-dir

CMD ["main.handler"]
